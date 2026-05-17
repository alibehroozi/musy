import type { ScoringEventType } from "@moc/contracts";

export type ScoreDelta =
  | { readonly op: "inc"; readonly delta: number }
  | { readonly op: "set"; readonly value: number };

// LOGIC-30: the single source of truth for the contextual-scoring deltas.
// Right-swipe / save / listen-completed are increments; left-swipe is a
// HARD set to 0 (even rows that didn't exist are created at 0 so the
// "user explicitly dismissed this song in this context" signal survives).
const SCORE_DELTAS: Record<ScoringEventType, ScoreDelta> = {
  "right-swipe": { op: "inc", delta: 10 },
  save: { op: "inc", delta: 15 },
  "listen-completed": { op: "inc", delta: 5 },
  "left-swipe": { op: "set", value: 0 },
};

export function scoreDelta(eventType: ScoringEventType): ScoreDelta {
  return SCORE_DELTAS[eventType];
}

// LOGIC-31: collapse any number into the integer range [0, 100]. NaN
// and ±Infinity collapse to 0; non-integer values round toward zero so
// a clamped +inc never overshoots (Math.trunc rounds toward zero).
export function clampScore(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  const truncated = Math.trunc(raw);
  if (truncated < 0) return 0;
  if (truncated > 100) return 100;
  return truncated;
}
