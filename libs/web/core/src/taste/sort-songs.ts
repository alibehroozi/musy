import type { BucketDetailSong } from "@moc/contracts";

/**
 * LOGIC-39: sort bucket songs by score descending; ties broken by
 * lastUpdatedAt descending (ISO-8601 string — lexicographic comparison
 * is monotone for the server's YYYY-MM-DDTHH:mm:ss.sssZ format).
 * Returns a new array; never mutates the input.
 */
export function sortByScoreDesc(rows: BucketDetailSong[]): BucketDetailSong[] {
  return [...rows].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.lastUpdatedAt < a.lastUpdatedAt ? -1 : b.lastUpdatedAt > a.lastUpdatedAt ? 1 : 0;
  });
}
