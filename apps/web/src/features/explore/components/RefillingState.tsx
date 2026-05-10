import { useEffect, useState } from "react";
import { Button, Typography } from "@moc/design-system";

interface RefillingStateProps {
  onRetry: () => void;
}

/**
 * Empty / refilling state. Three-dot animation, "Inspired by your taste"
 * caption, and a Try-again button that appears 10 s after mount.
 */
export function RefillingState({ onRetry }: RefillingStateProps): JSX.Element {
  const [showRetry, setShowRetry] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowRetry(true), 10_000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      data-testid="explore-refilling"
      className="flex-1 flex flex-col items-center justify-center gap-4 p-6"
    >
      <div aria-hidden className="flex gap-2" data-testid="explore-refilling-dots">
        <span className="size-3 rounded-full bg-primary animate-pulse" />
        <span
          className="size-3 rounded-full bg-primary animate-pulse"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="size-3 rounded-full bg-primary animate-pulse"
          style={{ animationDelay: "300ms" }}
        />
      </div>
      <Typography variant="body" className="text-text-muted">
        Inspired by your taste
      </Typography>
      {showRetry && (
        <Button variant="secondary" size="md" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
