import { Typography } from "@moc/design-system";
import { useAuth } from "./hooks/useAuth.js";
import { SignInPage } from "./features/auth/SignInPage.js";

export function App(): JSX.Element {
  const { state } = useAuth();

  if (state.status === "loading") {
    return (
      <main
        className="min-h-screen flex items-center justify-center p-8"
        aria-busy="true"
        aria-live="polite"
      >
        <Typography variant="body">Loading…</Typography>
      </main>
    );
  }

  if (state.status === "unauthenticated") {
    return <SignInPage />;
  }

  return (
    <main className="max-w-3xl mx-auto p-8 flex flex-col gap-4">
      <Typography variant="h1">musy</Typography>
      <Typography variant="body">Music app with AI-powered taste processing.</Typography>
    </main>
  );
}
