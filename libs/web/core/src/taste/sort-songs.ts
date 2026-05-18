import type { SongSnapshot } from "@moc/contracts";

/**
 * The minimum row shape `sortBySCoreDesc` consumes. The bucket-detail
 * endpoint returns `score`/`songKey`/`snapshot` per row; `lastUpdatedAt`
 * comes from the underlying `bucket_song_scores` document and is used
 * for the tie-break per LOGIC-40. We accept either Date or ISO string
 * because the wire payload is JSON (string) while server-internal
 * callers may pass `Date`.
 */
export interface SortableSongRow {
  songKey: string;
  snapshot: SongSnapshot;
  score: number;
  lastUpdatedAt: string | Date;
}

/**
 * LOGIC-40: deterministic, total, side-effect free sort for the
 * bucket-detail song list.
 *
 *   1. `score` descending.
 *   2. Tie on `score` → `lastUpdatedAt` descending (more recent first).
 *   3. Residual tie (same score AND same lastUpdatedAt) → `songKey`
 *      ascending so two otherwise-indistinguishable rows still have a
 *      fixed order across reloads.
 *
 * Does not mutate its input. Returns `[]` for empty input. The helper
 * is the single source of truth for this ordering — any future surface
 * that renders a bucket's full song list imports it rather than
 * inlining a comparator.
 *
 * The misspelled `S` in `sortBySCoreDesc` is intentional (matches the
 * helper name pinned by INVARIANTS.md / the product spec).
 */
export function sortBySCoreDesc<T extends SortableSongRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    const aTime = timeOf(a.lastUpdatedAt);
    const bTime = timeOf(b.lastUpdatedAt);
    if (aTime !== bTime) return bTime - aTime;
    return a.songKey < b.songKey ? -1 : a.songKey > b.songKey ? 1 : 0;
  });
}

function timeOf(v: string | Date): number {
  if (v instanceof Date) return v.getTime();
  const t = Date.parse(v);
  return Number.isNaN(t) ? 0 : t;
}
