"use client";

import FullScreenLoading from "@components/ui/FullScreenLoading";
import loadConfig, { buildExtras } from "@utils/config";
import { usePathname } from "next/navigation";
import React, { useEffect, useState } from "react";
import { AuthProvider, AuthProviderProps } from "react-oidc-context";
import { WebStorageStateStore } from "oidc-client-ts";
import { SecureProvider } from "@/auth/SecureProvider";

type Props = {
  children: React.ReactNode;
};

const config = loadConfig();

export default function OIDCProvider({ children }: Props) {
  const [oidcConfig, setOidcConfig] = useState<AuthProviderProps | null>(null);
  const [mounted, setMounted] = useState(false);
  const path = usePathname();

  useEffect(() => {
    const extras = buildExtras();

    const cfg: AuthProviderProps = {
      authority: config.authority,
      client_id: config.clientId,
      redirect_uri: window.location.origin + "/",
      silent_redirect_uri:
        window.location.origin + config.silentRedirectURI,
      scope: config.scopesSupported,
      // Store ALL OIDC state (including PKCE verifier) in localStorage so it
      // survives Authentik's redirect chain which loses sessionStorage.
      userStore: new WebStorageStateStore({ store: window.localStorage }),
      // Automatically process the ?code= callback when it appears in the URL
      onSigninCallback: () => {
        // After the callback, remove the OIDC params from the URL without
        // adding a history entry.
        window.history.replaceState({}, document.title, window.location.pathname);
      },
      ...(config.clientSecret
        ? { client_secret: config.clientSecret }
        : {}),
      // Pass extra params (audience, drag-query-params, etc.) to the
      // authorization endpoint so they reach the IdP.
      ...(Object.keys(extras).length > 0
        ? { extraQueryParams: extras }
        : {}),
    };

    setOidcConfig(cfg);
    setMounted(true);
  }, []);

  // Bypass authentication for pages that do not require auth.
  if (path === "/install" || path === "/setup" || path?.startsWith("/invite"))
    return children;

  return mounted && oidcConfig ? (
    <AuthProvider {...oidcConfig}>
      <SecureProvider>{children}</SecureProvider>
    </AuthProvider>
  ) : (
    <FullScreenLoading />
  );
}
