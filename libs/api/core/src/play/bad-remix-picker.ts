// Pure picker used by the /play/reresolve endpoint (API-22).
//
// Given a list of SoundCloud candidates and the set of sourceTrackIds the
// user has already tried, returns the candidate with the strictly highest
// `playbackCount` that is NOT in the exclude-set. Ties (same playbackCount)
// are broken lexicographically by id so the result is deterministic across
// call order and across machines.

export interface SoundCloudCandidate {
  id: string;
  title: string;
  artist: string;
  durationSec: number;
  permalink: string;
  playbackCount: number;
}

export function pickHighestPlaybackUntried<T extends { id: string; playbackCount: number }>(
  candidates: readonly T[],
  excludeIds: ReadonlySet<string>,
): T | null {
  let best: T | null = null;
  for (const c of candidates) {
    if (excludeIds.has(c.id)) continue;
    if (!best) {
      best = c;
      continue;
    }
    if (c.playbackCount > best.playbackCount) {
      best = c;
      continue;
    }
    if (c.playbackCount === best.playbackCount && c.id < best.id) {
      best = c;
    }
  }
  return best;
}

export function sortByPlaybackCountDesc<T extends { id: string; playbackCount: number }>(
  candidates: readonly T[],
): T[] {
  return [...candidates].sort((a, b) => {
    if (b.playbackCount !== a.playbackCount) return b.playbackCount - a.playbackCount;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
