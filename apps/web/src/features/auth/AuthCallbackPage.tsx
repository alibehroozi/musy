import { useEffect, useState } from "react";

/**
 * Landing page for the OAuth callback redirect. The tab was opened by window.open()
 * from SignInModal, so window.close() should succeed in most browsers. A fallback
 * message is shown if the browser blocks programmatic close.
 */
export function AuthCallbackPage(): JSX.Element {
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    window.close();
    // If close didn't happen within 500ms, the browser blocked it — show fallback
    const t = setTimeout(() => setShowFallback(true), 500);
    return () => clearTimeout(t);
  }, []);

  if (!showFallback) return <div />;

  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <p className="text-text font-semibold">You&apos;re signed in!</p>
        <p className="text-text-muted text-sm">You can close this tab and return to the app.</p>
      </div>
    </div>
  );
}
