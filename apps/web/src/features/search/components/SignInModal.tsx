import { useCallback, useEffect } from "react";
import { Button, Icon, Modal, Typography } from "@moc/design-system";
import { useAuth } from "../../../hooks/useAuth.js";

interface SignInModalProps {
  open: boolean;
  onClose: () => void;
  /** Override navigation in tests — defaults to `window.location.href = url`. */
  onSignIn?: () => void;
}

/**
 * Sign-in gate for anonymous users who tapped a result row or the
 * save button. Reuses the existing `/api/auth/google` redirect flow.
 *
 * Auto-closes on successful sign-in by listening to AuthContext —
 * see "Failure modes" item 2 in the feature spec.
 */
export function SignInModal({ open, onClose, onSignIn }: SignInModalProps): JSX.Element {
  const { state } = useAuth();

  useEffect(() => {
    if (open && state.status === "authenticated") onClose();
  }, [open, state.status, onClose]);

  const handleSignIn = useCallback(() => {
    if (onSignIn) {
      onSignIn();
      return;
    }
    window.location.href = "/api/auth/google";
  }, [onSignIn]);

  return (
    <Modal open={open} onClose={onClose} title="Sign in to save songs">
      <Typography variant="body" className="text-text-muted mb-6">
        Sign in with Google to save songs you like and shape your taste profile.
      </Typography>
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={handleSignIn}
        data-testid="sign-in-google-button"
      >
        <Icon name="google-brand" size={20} className="shrink-0" />
        <span>Continue with Google</span>
      </Button>
    </Modal>
  );
}
