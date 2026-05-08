import { useEffect } from "react";
import { Modal, Button, Typography } from "@moc/design-system";
import { useAuthContext } from "../../../contexts/AuthContext.js";
import { GOOGLE_LOGIN_URL } from "../../auth/api.js";

interface SignInModalProps {
  open: boolean;
  onClose: () => void;
}

export function SignInModal({ open, onClose }: SignInModalProps): JSX.Element {
  const { state } = useAuthContext();

  // Close the modal automatically when the user signs in
  useEffect(() => {
    if (state.status === "authenticated" && open) {
      onClose();
    }
  }, [state.status, open, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sign in to save songs"
      footer={
        <Button
          variant="primary"
          size="lg"
          style={{ width: "100%" }}
          onClick={() => {
            window.location.href = GOOGLE_LOGIN_URL;
          }}
        >
          Continue with Google
        </Button>
      }
    >
      <Typography variant="body">
        Sign in with Google to save songs you like and shape your taste profile.
      </Typography>
    </Modal>
  );
}
