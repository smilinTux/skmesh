import { usePathname } from "next/navigation";
import * as React from "react";
import { useEffect } from "react";
import { useAuth } from "react-oidc-context";
import FullScreenLoading from "@components/ui/FullScreenLoading";

const QUERY_PARAMS_KEY = "netbird-query-params";
const PRESERVE_QUERY_PARAMS_PATHS = ["/peer/ssh", "/peer/rdp"];
const VALID_PARAMS = [
  "tab",
  "search",
  "id",
  "invite",
  "utm_source",
  "utm_medium",
  "utm_content",
  "utm_campaign",
  "hs_id",
  "page",
  "page_size",
  "user",
  "port",
];

type Props = {
  children: React.ReactNode;
};

export const SecureProvider = ({ children }: Props) => {
  const auth = useAuth();
  const currentPath = usePathname();
  const isAuthenticated = auth.isAuthenticated;

  useEffect(() => {
    if (isAuthenticated && !PRESERVE_QUERY_PARAMS_PATHS.includes(currentPath)) {
      localStorage.removeItem(QUERY_PARAMS_KEY);
    } else if (!isAuthenticated) {
      try {
        const params = window.location.search.substring(1);
        if (params) {
          const urlParams = new URLSearchParams(params);
          if (VALID_PARAMS.some((param) => urlParams.has(param))) {
            localStorage.setItem(QUERY_PARAMS_KEY, JSON.stringify(params));
          }
        }
      } catch (e) {}
    }
  }, [isAuthenticated, currentPath]);

  useEffect(() => {
    let timeout: NodeJS.Timeout | undefined = undefined;
    if (!isAuthenticated && !auth.isLoading && !auth.activeNavigator) {
      timeout = setTimeout(async () => {
        if (!auth.isAuthenticated) {
          await auth.signinRedirect();
        }
      }, 1500);
    }
    return () => {
      clearTimeout(timeout);
    };
  }, [currentPath, isAuthenticated, auth]);

  // Show loading while the OIDC library is processing the callback or
  // refreshing tokens.
  if (auth.isLoading) {
    return <FullScreenLoading />;
  }

  return <>{children}</>;
};
