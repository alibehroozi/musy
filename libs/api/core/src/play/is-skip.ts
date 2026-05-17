/**
 * LOGIC-36 — pure skip-detection predicate.
 *
 * A play counts as a "skip" iff the user listened for < 30 s AND played
 * less than 50 % of the track. Both conditions must hold; the boundary
 * values (exactly 30 000 ms, exactly 0.5 ratio) return false.
 */
export function isSkip({
  playedMs,
  durationMs,
}: {
  playedMs: number;
  durationMs: number;
}): boolean {
  return playedMs < 30_000 && playedMs / durationMs < 0.5;
}
