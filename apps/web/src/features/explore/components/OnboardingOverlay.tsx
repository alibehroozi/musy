import { Button, Typography } from "@moc/design-system";

interface OnboardingOverlayProps {
  onDismiss: () => void;
}

/**
 * First-visit overlay covering the top card. UI-17: role="dialog",
 * aria-modal="true". The DS Modal is a portaled overlay that's wrong
 * here because the spec calls for an in-card welcome panel that sits
 * inside the swipe deck — we use plain ARIA on a div instead.
 */
export function OnboardingOverlay({ onDismiss }: OnboardingOverlayProps): JSX.Element {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="explore-onboarding-title"
      data-testid="explore-onboarding"
      className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-bg/95 p-6 text-center gap-4 rounded-lg"
    >
      <Typography variant="h2" className="text-text">
        <span id="explore-onboarding-title">Welcome to Explore</span>
      </Typography>
      <Typography variant="body" className="text-text-muted max-w-xs">
        Swipe right to like, left to pass. Each card auto-plays a preview — pause anytime.
      </Typography>
      <Button variant="primary" size="lg" onClick={onDismiss}>
        Got it
      </Button>
    </div>
  );
}
