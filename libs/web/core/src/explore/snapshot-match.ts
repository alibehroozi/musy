import type { SongSnapshot } from "@moc/contracts";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Pure equality on the same triple `computeSnapshotHash` (api-core) folds
 * for hashing — `(title, artist, durationSec)` modulo trailing whitespace
 * and ASCII case in `title` and `artist`. Used in the FE to decide whether
 * the player's currentTrack and the explore queue's top card refer to the
 * same underlying song without pulling Node's `crypto` into the bundle.
 */
export function snapshotsMatch(a: SongSnapshot | null, b: SongSnapshot | null): boolean {
  if (a === null || b === null) return false;
  if (normalize(a.title) !== normalize(b.title)) return false;
  if (normalize(a.artist) !== normalize(b.artist)) return false;
  if ((a.durationSec ?? null) !== (b.durationSec ?? null)) return false;
  return true;
}
