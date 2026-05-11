import type { QueuePhase } from "@moc/contracts";

interface PhasePillProps {
  phase: QueuePhase | null;
}

const COPY: Record<Exclude<QueuePhase, "personalized">, string> = {
  discovery: "Discovering taste",
  "artist-refinement": "Finding artists",
};

/**
 * Topbar phase indicator.
 *
 * UI-18: copy is "Discovering taste" / "Finding artists"; for "personalized"
 * (or `null`) the pill is absent entirely.
 */
export function PhasePill({ phase }: PhasePillProps): JSX.Element | null {
  if (phase === null || phase === "personalized") return null;
  return (
    <span
      data-testid="phase-pill"
      className="inline-flex items-center px-3 py-1 rounded-full border border-border text-text-muted text-xs"
    >
      {COPY[phase]}
    </span>
  );
}
