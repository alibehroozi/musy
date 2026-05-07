import { Button, Typography } from "@moc/design-system";
import { GoogleIcon } from "./components/GoogleIcon.js";
import { GOOGLE_LOGIN_URL } from "./api.js";

const SIGN_IN_LABEL = "Sign in with Google";

/**
 * Unauthenticated landing page. The button is a top-level navigation to the
 * API's OAuth start route — server-redirect flow keeps the session cookie
 * httpOnly and out of JS.
 */
export function SignInPage(): JSX.Element {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-8 text-center">
      <Typography variant="h1">musy</Typography>
      <Typography variant="body">Sign in to start processing your music taste.</Typography>
      <Button
        variant="secondary"
        size="lg"
        onClick={() => {
          window.location.href = GOOGLE_LOGIN_URL;
        }}
        aria-label={SIGN_IN_LABEL}
      >
        <GoogleIcon />
        <span>{SIGN_IN_LABEL}</span>
      </Button>
    </main>
  );
}
