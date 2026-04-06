import { useAuth } from "react-oidc-context";
import Button from "@components/Button";
import { Modal, ModalTrigger } from "@components/modal/Modal";
import useFetchApi from "@utils/api";
import { PlusCircle } from "lucide-react";
import React, { memo, useState } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { Peer } from "@/interfaces/Peer";
import SetupModal from "@/modules/setup-netbird-modal/SetupModal";

function AddPeerButton() {
  const { data: peers } = useFetchApi<Peer[]>("/peers");
  const { user } = useAuth();

  const [hasOnboardingFormCompleted] = useLocalStorage(
    "netbird-onboarding-modal",
    false,
  );

  const [isFirstRun, setIsFirstRun] = useLocalStorage<boolean>(
    "netbird-first-run",
    !(peers && peers.length > 0),
  );

  const [installModal, setInstallModal] = useState(
    !hasOnboardingFormCompleted
      ? process.env.APP_ENV !== "test"
        ? false
        : isFirstRun
      : isFirstRun,
  );

  const handleOpenChange = (open: boolean) => {
    setInstallModal(open);
    setIsFirstRun(false);
  };

  return (
    <>
      <Modal open={installModal} onOpenChange={handleOpenChange}>
        <ModalTrigger asChild>
          <Button variant={"primary"} size={"sm"} className={"ml-auto"}>
            <PlusCircle size={16} />
            Add Peer
          </Button>
        </ModalTrigger>
        <SetupModal user={user?.profile} />
      </Modal>
    </>
  );
}

export default memo(AddPeerButton);
