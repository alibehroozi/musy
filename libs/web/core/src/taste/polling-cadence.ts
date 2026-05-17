/**
 * LOGIC-38: deterministic polling-cadence helper for the `/taste` page.
 *
 * Cadence:
 *   - `elapsedMs <  30_000` →  3_000 ms (3 s baseline while the build is fresh)
 *   - `elapsedMs <  120_000` → 8_000 ms (8 s after 30 s elapsed — backoff)
 *   - `elapsedMs >= 120_000` → null    (stop polling; UI takes over and
 *                                       renders the still-building bucket
 *                                       in `failed` visual)
 *
 * Defensive defaults: NaN, -Infinity, and negative inputs collapse to the
 * start-of-window behavior (3_000) so clock skew or a malformed timestamp
 * never silently halts polling. +Infinity is treated as past-the-stop so
 * a genuinely-stopped poll does not restart on a degenerate value.
 */
export function nextPollDelayMs(input: { elapsedMs: number }): number | null {
  const { elapsedMs } = input;
  if (Number.isNaN(elapsedMs) || elapsedMs === -Infinity || elapsedMs < 0) {
    return 3_000;
  }
  if (elapsedMs >= 120_000) return null;
  if (elapsedMs >= 30_000) return 8_000;
  return 3_000;
}
