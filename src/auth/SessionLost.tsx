import Button from "@components/Button";
import Paragraph from "@components/Paragraph";
import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useEffect } from "react";
import { useAuth } from "react-oidc-context";
import NetBirdIcon from "@/assets/icons/NetBirdIcon";

export const SessionLost = () => {
  const router = useRouter();
  const auth = useAuth();

  useEffect(() => {
    router.push("/peers");
  });

  const handleLogin = () => {
    auth.removeUser().then(() => {
      auth.signinRedirect();
    });
  };

  return (
    <div
      className={
        "flex items-center justify-center flex-col h-screen max-w-md mx-auto"
      }
    >
      <div
        className={
          "bg-nb-gray-930 mb-3 border border-nb-gray-900 h-10 w-10 rounded-md flex items-center justify-center "
        }
      >
        <NetBirdIcon size={20} />
      </div>
      <h1>Session Expired</h1>
      <Paragraph className={"text-center"}>
        It looks like your login session is no longer active or has expired.
        Please login again to continue using the app.
      </Paragraph>
      <Button
        variant={"primary"}
        size={"sm"}
        className={"mt-5"}
        onClick={handleLogin}
      >
        Login
        <LogIn size={16} />
      </Button>
    </div>
  );
};
