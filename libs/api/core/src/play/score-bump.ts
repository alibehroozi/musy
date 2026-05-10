import type { PlayEventType } from "@moc/contracts";

export type SwipeScoreEventType = "swiped_right" | "swiped_left";
export type ScoreEventType = PlayEventType | SwipeScoreEventType;

const SCORE_EVENT_FLOOR: Record<Exclude<ScoreEventType, "swiped_left">, number> = {
  started: 3,
  completed: 5,
  swiped_right: 8,
};

/**
 * Pure max-rule for interest-score bumps.
 *
 * "started" / "completed" come from listening events (LOGIC-07).
 * "swiped_right" matches the saved=8 strength from the Search epic; an
 * Explore right-swipe is treated as equivalently strong evidence of
 * "I like this" (LOGIC-14). "swiped_left" is a no-op here — the swipes
 * ledger is the only record; the interest score is positive-only.
 *
 * Deterministic, no I/O. Result is never less than oldScore (monotonic).
 */
export function bumpScore(oldScore: number, eventType: ScoreEventType): number {
  if (eventType === "swiped_left") return oldScore;
  return Math.max(oldScore, SCORE_EVENT_FLOOR[eventType]);
}
