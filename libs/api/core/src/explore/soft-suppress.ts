export interface SoftSuppressSwipe {
  direction: "right" | "left";
  artist: string;
}

export interface SoftSuppressedArtistsInput {
  swipeHistory: ReadonlyArray<SoftSuppressSwipe>;
  threshold?: number;
}

/**
 * LOGIC-42: returns the set of artists with >= threshold left-direction
 * swipes in the user's history. Artist names are trim+lowercase normalized
 * before counting; the returned set contains the lowercase form so callers
 * compare via the same normalization.
 *
 * Default threshold = 2 (one left-swipe is noise; two or more is a vote).
 * Right-swipes never contribute to the count.
 */
export function softSuppressedArtists(input: SoftSuppressedArtistsInput): Set<string> {
  const threshold = input.threshold ?? 2;
  const counts = new Map<string, number>();
  for (const s of input.swipeHistory) {
    if (s.direction !== "left") continue;
    const key = s.artist.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const suppressed = new Set<string>();
  for (const [artist, count] of counts) {
    if (count >= threshold) suppressed.add(artist);
  }
  return suppressed;
}
