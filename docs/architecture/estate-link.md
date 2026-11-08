# Pattern: linking independent skmesh estates

Two (or more) estates each run their own skmesh (NetBird) with their own management, IdP, users,
policies and mesh range. Nobody joins the other estate's mesh. Instead, one **gateway peer** per
estate holds a plain WireGuard tunnel to the other estate's gateway, and each estate advertises the
other estate's range as a **NetBird network route** through its own gateway, handed out only to the
groups that should cross.

Each estate stays sovereign: either side can cut the link alone by disabling its route, its
gateway's tunnel, or both. No shared database, no shared IdP, no peer from one estate ever
appears in the other estate's dashboard.

```
 Estate A (skmesh A, range 10.250.0.0/16)            Estate B (skmesh B, range 10.251.0.0/16)

  A clients ──wt0──► A gateway ══ WireGuard ══ B gateway ◄──wt0── B exposed peers
  (group with        (routing peer for           link net         (routing peer for
   route to B)        10.251/16, masquerade)   10.255.255.0/30      10.250/16, masquerade)
```

## When to use it

- Two households, companies or clusters that must stay administratively separate but need some
  traffic between them (remote desktop, a shared service, backups).
- Not for merging estates: if both sides should be one trust domain, run one skmesh.

## Requirements

1. **Non-overlapping mesh ranges.** Give every estate its own `/16` from a private block, never
   from `100.64.0.0/10` (Tailscale's CGNAT range; Tailscale's `ts-input` chain drops it from any
   interface but `tailscale0`). Example: estate A `10.250.0.0/16`, estate B `10.251.0.0/16`.
   Set it in the NetBird account settings before peers join; changing it later renumbers everyone.
2. **No local route inside the other range on any client.** A more specific local route wins over
   the NetBird route (seen: an LXD bridge `lxdbr0` at `10.251.156.0/24` on a laptop of estate A).
   Check with `ip -4 route | grep '^10\.251'` on every client and move such bridges away.
3. **A link net** for the tunnel itself, outside both ranges, e.g. `10.255.255.0/30`.
4. **One reachable UDP port** on at least one gateway. The other side can sit behind any NAT: it
   dials out and keeps the mapping open with `PersistentKeepalive`.
5. Gateways are normal enrolled peers of their own estate (setup key, login expiry off).

## Building it

### 1. WireGuard between the gateways

Keys stay on the gateways (`umask 077; wg genkey | tee estate-<peer>.key | wg pubkey`), mode 0600,
loaded with `PostUp = wg set %i private-key ...` so no key is in the config file.

Listening side (here estate B, `/etc/wireguard/wg-<a>.conf`):

```ini
[Interface]
Address = 10.255.255.2/30
ListenPort = 51830
PostUp = wg set %i private-key /etc/wireguard/estate-<a>.key
PostUp = iptables -I FORWARD 1 -i wt0 -o %i -j ACCEPT; iptables -I FORWARD 1 -i %i -o wt0 -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -o %i -j MASQUERADE; iptables -t nat -A POSTROUTING -s 10.255.255.0/30 -o wt0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wt0 -o %i -j ACCEPT; iptables -D FORWARD -i %i -o wt0 -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o %i -j MASQUERADE; iptables -t nat -D POSTROUTING -s 10.255.255.0/30 -o wt0 -j MASQUERADE

[Peer]
PublicKey = <A gateway public key>
AllowedIPs = 10.255.255.1/32, 10.250.0.0/16
```

Dialing side (estate A): the same with `Address = 10.255.255.1/30`, no `ListenPort`, and in
`[Peer]` `Endpoint = <B public IP>:51830`, `AllowedIPs = 10.255.255.2/32, 10.251.0.0/16`,
`PersistentKeepalive = 25`.

`systemctl enable --now wg-quick@wg-<b>` on both. `AllowedIPs` puts the other estate's range on
the tunnel in the gateway's own routing table; NetBird does not install a client route on the
routing peer itself, so the two never fight.

**Double masquerade, on purpose.** Each gateway rewrites traffic leaving into the tunnel to its
link address and traffic leaving into its own mesh to its own mesh IP. So each estate only ever
sees its own gateway as the source; no foreign address enters either NetBird ACL engine, and no
estate needs routes or policies that name the other estate's peers. The cost: the far side sees
the gateway, not the real client, as the source IP.

### 2. Opening the listening port

Forward UDP `51830` on the listening estate's router to its gateway. If the router supports
UPnP/NAT-PMP, renew a mapping from the gateway instead of touching the router (miniupnpc):

```bash
# /usr/local/sbin/skmesh-estate-upnp.sh  (run as User=nobody: root got "No IGD found" here)
LAN=$(ip -4 -o route get 1.1.1.1 | sed -n 's/.* src \([0-9.]*\).*/\1/p')
out=$(upnpc -e skmesh-estate-link-<a> -a "$LAN" 51830 51830 UDP 7200 2>&1)
echo "$out" | grep -q "is redirected to internal $LAN:51830" && logger -t skmesh-estate-upnp renewed || { logger -t skmesh-estate-upnp "FAILED: $out"; exit 1; }
```

with a oneshot service plus a timer (`OnBootSec=1min`, `OnUnitActiveSec=30min`), and allow the
port on the host firewall (`ufw allow 51830/udp`). Check `wg show` for a recent handshake.

### 3. NetBird objects in each estate

| Object | Estate A | Estate B |
|---|---|---|
| Group: the gateway | `estate-gateway` (A gateway) | `estate-gateway` (B gateway) |
| Group: who may cross | `estate-<b>-access` (A clients) | `estate-exposed` (B peers reachable from A, and that may reach A) |
| Network route | `10.251.0.0/16`, routing peer A gateway, distribution `estate-<b>-access`, masquerade on, metric 9999, keep route | `10.250.0.0/16`, routing peer B gateway, distribution `estate-exposed`, masquerade on |
| Policy (once the default `All <-> All` is replaced) | access group to `estate-gateway` | `estate-gateway` to `estate-exposed`, bidirectional |

Routes are what limit who can cross from the client side: a peer outside the distribution group
has no route to the other range. Policies are what limit what the gateway may reach inside its own
estate. With NetBird's default `All <-> All` policy still enabled, traffic arriving from the other
estate can reach every peer of the receiving estate. Each estate should replace the default
policy with explicit ones (`estate-gateway -> estate-exposed`, ports as needed) before exposing
anything sensitive. That decision belongs to each estate's owner.

### 4. Verify

From an access-group client of A: `ip route get <B exposed peer IP>` shows `dev wt0 table netbird`,
then ping and a TCP port. The same from B to A. On each gateway, `wg show` (handshake, transfer)
and `iptables -t nat -S POSTROUTING | grep 10.255.255`.

### 5. Exposing only some peers (allow-list)

When an estate should show the other side only a few machines (not its whole range), do both:

1. In the **other** estate, route single addresses instead of the range: one `/32` route per
   allowed peer (same routing peer, same distribution group). Its peers then have no route to the
   rest of your range at all.
2. On **your** gateway, enforce it, so a mistake on the other side cannot widen it. In
   `wg-<other>.conf` replace the blanket `-i %i -o wt0 -j ACCEPT` with:

```ini
PostUp = iptables -I FORWARD 1 -i wt0 -o %i -j ACCEPT
PostUp = iptables -I FORWARD 1 -i %i -o wt0 -j DROP
PostUp = iptables -I FORWARD 1 -i %i -o wt0 -d <peer1>,<peer2> -j ACCEPT
PostUp = iptables -I FORWARD 1 -i %i -o wt0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
PostUp = iptables -I INPUT 1 -i %i -j DROP
PostUp = iptables -I INPUT 1 -i %i -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
```

(with the matching `PostDown = iptables -D ...` lines). Your own clients keep reaching the other
estate (their replies are ESTABLISHED); the other estate can open connections only to the listed
peers, and never to the gateway's own services. Peer mesh IPs are stable per peer, but re-check
the list after re-enrolling one.

## Taking it down

Either side, alone: disable its NetBird route (instant, clients lose the path), then
`systemctl disable --now wg-quick@wg-<other>` and the UPnP timer. Delete the groups and keys when
the link is retired for good.

## Worked example (2026-11-08)

| | NOR (skstack01, Chef) | NAM (namstack01, Casey) |
|---|---|---|
| skmesh | `skmesh.skstack01.douno.it`, NetBird 0.82.0 | `skmesh.nativeassetmanagement.com`, NetBird 0.82.0 |
| Range | `10.250.0.0/16` | `10.251.0.0/16` |
| Gateway | norap1001 (`10.250.100.8`), dials out, `wg-nam`, link `10.255.255.1` | namwrk1005 (`10.251.16.178`), listens UDP 51830 (UPnP on the Firewalla), `wg-nor`, link `10.255.255.2` |
| Route | `nam-estate` 10.251/16 via norap1001 to `estate-nam-access` (laptop .41, noroc2027) | `nor-estate-41` and `nor-estate-noroc2027` (two /32s) via namwrk1005 to `estate-exposed` (namwrk1004) |
| Measured | .41 / noroc2027 / norap1001 to namwrk1004: 0% loss, about 40 ms, TCP 1713 open | namwrk1004 to norap1001: 0% loss, about 37 ms, skdesk TCP 21116 open |

NOR shows NAM only .41 and noroc2027 (allow-list above, enforced on norap1001; norap1001 itself and
every other NOR peer are blocked from NAM, verified). NAM still runs the default `All <-> All`
policy; tightening it is Casey's call.
Both run NetBird next to Tailscale on the same hosts without conflict.
