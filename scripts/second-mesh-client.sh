#!/bin/bash
# One host: second NetBird client for Casey's NAM mesh, isolated in a container.
# Own config volume (no shared profiles), own interface wt1/port 51821, own nft table
# and fwmark, no DNS, no routes. Main NOR client (wt0) is untouched.
set -euo pipefail
KEY_FILE=${1:-}
docker pull -q netbirdio/netbird:0.82.0 >/dev/null
docker rm -f netbird-nam >/dev/null 2>&1 || true
docker run -d --name netbird-nam --restart unless-stopped --network host \
  --cap-add NET_ADMIN --cap-add SYS_ADMIN --cap-add SYS_RESOURCE \
  -v netbird-nam:/var/lib/netbird \
  ${KEY_FILE:+-e NB_SETUP_KEY="$(cat "$KEY_FILE")"} \
  -e NB_MANAGEMENT_URL=https://skmesh.nativeassetmanagement.com:443 \
  -e NB_HOSTNAME=cbrd21-laptop12thgenintelcore \
  -e NB_INTERFACE_NAME=wt1 -e NB_WIREGUARD_PORT=51821 \
  -e NB_DISABLE_DNS=true -e NB_DISABLE_CLIENT_ROUTES=true -e NB_DISABLE_SERVER_ROUTES=true \
  -e NB_NFTABLES_TABLE=netbird-nam -e NB_FWMARK_BASE=115200 -e NB_DISABLE_CUSTOM_ROUTING=true \
  -e NB_LAZY_CONN=false -e NB_BLOCK_INBOUND=true \
  netbirdio/netbird:0.82.0
