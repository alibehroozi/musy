export interface FormattedProgress {
  /** Position fraction in [0, 1]. */
  fraction: number;
  /** Current time formatted as `m:ss` (or `h:mm:ss` ≥ 1h). */
  currentLabel: string;
  /** Remaining time prefixed with `-` (negative duration). */
  remainingLabel: string;
}

const ZERO: FormattedProgress = {
  fraction: 0,
  currentLabel: "0:00",
  remainingLabel: "-0:00",
};

function formatSeconds(totalSeconds: number, withHours: boolean): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const seconds = (s % 60).toString().padStart(2, "0");
  const minutes = Math.floor(s / 60) % 60;
  if (withHours) {
    const hours = Math.floor(s / 3600);
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds}`;
  }
  return `${minutes}:${seconds}`;
}

/**
 * Pure helper — derives the displayable progress state from the engine's
 * raw millisecond positions. Total: every input maps to a valid result
 * (no throw) so the caller never has to defend against NaN / 0 / overflow.
 *
 * Edge cases (LOGIC-11):
 *   - durationMs <= 0, NaN, or non-finite → all-zero
 *   - currentMs >= durationMs → fraction=1, remaining="-0:00"
 *   - durationMs >= 1 hour → labels switch to h:mm:ss
 */
export function formatProgress(currentMs: number, durationMs: number): FormattedProgress {
  if (!Number.isFinite(currentMs) || !Number.isFinite(durationMs) || durationMs <= 0) {
    return ZERO;
  }
  const safeCurrent = Math.max(0, Math.min(currentMs, durationMs));
  const fraction = safeCurrent / durationMs;
  const remainingMs = Math.max(0, durationMs - safeCurrent);
  const withHours = durationMs >= 3_600_000;

  return {
    fraction,
    currentLabel: formatSeconds(safeCurrent / 1000, withHours),
    remainingLabel: `-${formatSeconds(remainingMs / 1000, withHours)}`,
  };
}
