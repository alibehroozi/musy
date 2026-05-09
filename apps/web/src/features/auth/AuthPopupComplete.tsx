import { useEffect } from "react";
import { Typography } from "@moc/design-system";

export const AUTH_BROADCAST_CHANNEL = "musy-auth";

/**
 * Rendered in the OAuth popup window after a successful Google sign-in.
 * Notifies the opener via BroadcastChannel and immediately closes the popup.
 */
export function AuthPopupComplete(): JSX.Element {
  useEffect(() => {
    const bc = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
    bc.postMessage({ type: "auth-complete" });
    bc.close();
    window.close();
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
      <Typography variant="body">Signed in! This window will close automatically.</Typography>
    </main>
  );
}
