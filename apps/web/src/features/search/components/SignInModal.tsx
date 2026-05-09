import { useCallback, useEffect } from "react";
import { Button, Icon, Modal, Typography } from "@moc/design-system";
import { useAuth } from "../../../hooks/useAuth.js";
import { GOOGLE_LOGIN_URL } from "../../auth/api.js";
import { AUTH_BROADCAST_CHANNEL } from "../../auth/AuthPopupComplete.js";

const POPUP_FEATURES = "width=500,height=660,resizable=yes,scrollbars=yes";

interface SignInModalProps {
  open: boolean;
  onClose: () => void;
  /** Override popup open in tests — defaults to opening a popup window. */
  onSignIn?: () => void;
}

/**
 * Sign-in gate for anonymous users who tapped a result row or the
 * save button. Opens Google OAuth in a popup window; when the popup
 * completes, a BroadcastChannel message refreshes auth state and the
 * modal auto-closes.
 *
 * Auto-closes on successful sign-in by listening to AuthContext —
 * see "Failure modes" item 2 in the feature spec.
 */
export function SignInModal({ open, onClose, onSignIn }: SignInModalProps): JSX.Element {
  const { state, refresh } = useAuth();

  useEffect(() => {
    if (open && state.status === "authenticated") onClose();
  }, [open, state.status, onClose]);

  useEffect(() => {
    if (!open) return;
    const bc = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
    bc.onmessage = (e: MessageEvent<{ type: string }>) => {
      if (e.data?.type === "auth-complete") void refresh();
    };
    return () => bc.close();
  }, [open, refresh]);

  const handleSignIn = useCallback(() => {
    if (onSignIn) {
      onSignIn();
      return;
    }
    window.open(`${GOOGLE_LOGIN_URL}?popup=1`, "_blank", POPUP_FEATURES);
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
