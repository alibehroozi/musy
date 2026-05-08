export interface ProgressInfo {
  fraction: number;
  currentLabel: string;
  remainingLabel: string;
}

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatProgress(currentMs: number, durationMs: number): ProgressInfo {
  const safeCurrentMs = Number.isFinite(currentMs) && currentMs >= 0 ? currentMs : 0;
  const safeDurationMs = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;

  if (safeDurationMs === 0) {
    return { fraction: 0, currentLabel: "0:00", remainingLabel: "-0:00" };
  }

  const fraction = Math.min(1, safeCurrentMs / safeDurationMs);
  const remainingMs = Math.max(0, safeDurationMs - safeCurrentMs);

  return {
    fraction,
    currentLabel: formatMs(safeCurrentMs),
    remainingLabel: `-${formatMs(remainingMs)}`,
  };
}
