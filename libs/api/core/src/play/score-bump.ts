import type { PlayEventType } from "@moc/contracts";

const PLAY_EVENT_SCORE: Record<PlayEventType, number> = {
  started: 3,
  completed: 5,
};

/**
 * Pure max-rule for play-event score bumps.
 *
 * "started" matches the explored signal (3); "completed" is a stronger
 * play-through signal (5). Both never erase a higher prior score (e.g.
 * 8 from a /search/saved). Deterministic, no I/O — used by both the
 * play service and tests.
 */
export function bumpScore(oldScore: number, eventType: PlayEventType): number {
  return Math.max(oldScore, PLAY_EVENT_SCORE[eventType]);
}
