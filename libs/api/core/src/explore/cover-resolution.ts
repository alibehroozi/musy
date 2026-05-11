import type { SearchResult, SongSnapshot, TrackResult } from "@moc/contracts";

/**
 * Looks up a cover for a `(title, artist)` pair. Returns the best
 * `TrackResult` match (one whose `artworkUrl` is a non-empty URL),
 * or `null` when no candidate is available.
 *
 * Implementations are typically `async` at the call site — the queue
 * builder pre-resolves searches in parallel and then hands a sync
 * lookup into `resolveCoversForQueue`, keeping the algorithm pure.
 */
export type CoverLookup = (title: string, artist: string) => TrackResult | null;

/**
 * Final cover-resolution pass for the explore queue. Given a list of
 * candidate `SongSnapshot`s and a `(title, artist) -> TrackResult | null`
 * lookup, returns only the snapshots whose `coverUrl` is a non-empty
 * string after resolution:
 *
 *   - Candidates with an existing non-empty `coverUrl` pass through
 *     unchanged. The lookup is **not** consulted for them.
 *   - Candidates without `coverUrl` are kept iff the lookup returns a
 *     `TrackResult` with a non-empty `artworkUrl`; that artwork URL
 *     becomes the candidate's new `coverUrl`.
 *   - Candidates without `coverUrl` are dropped when the lookup
 *     returns `null`, or returns a `TrackResult` whose `artworkUrl`
 *     is `undefined` / empty.
 *
 * Survivors retain their relative order from the input. The function
 * is total, side-effect-free, and depends only on its arguments — no
 * `Date.now()`, no random, no I/O.
 */
export function resolveCoversForQueue(
  candidates: readonly SongSnapshot[],
  lookup: CoverLookup,
): SongSnapshot[] {
  const out: SongSnapshot[] = [];
  for (const candidate of candidates) {
    if (hasCover(candidate)) {
      out.push(candidate);
      continue;
    }
    const match = lookup(candidate.title, candidate.artist);
    const artwork = match?.artworkUrl;
    if (typeof artwork === "string" && artwork.length > 0) {
      out.push({ ...candidate, coverUrl: artwork });
    }
  }
  return out;
}

/**
 * Picks the best `TrackResult` carrying a non-empty `artworkUrl` from
 * a list of `SearchResult`s. Stations are skipped (the explore queue
 * is tracks-only). Returns the first track whose normalized title and
 * artist exactly match the inputs; failing an exact match, returns
 * the first track with artwork.
 *
 * Pure — same inputs always yield the same output.
 */
export function pickCoverMatch(
  title: string,
  artist: string,
  results: readonly SearchResult[],
): TrackResult | null {
  const tracks: TrackResult[] = [];
  for (const r of results) {
    if (r.type === "track" && typeof r.artworkUrl === "string" && r.artworkUrl.length > 0) {
      tracks.push(r);
    }
  }
  if (tracks.length === 0) return null;

  const normTitle = title.trim().toLowerCase();
  const normArtist = artist.trim().toLowerCase();
  for (const t of tracks) {
    if (
      t.title.trim().toLowerCase() === normTitle &&
      t.artist.trim().toLowerCase() === normArtist
    ) {
      return t;
    }
  }
  return tracks[0] ?? null;
}

function hasCover(snap: SongSnapshot): boolean {
  return typeof snap.coverUrl === "string" && snap.coverUrl.length > 0;
}
