export interface SoftSuppressSwipe {
  direction: "right" | "left";
  artist: string;
}

export interface SoftSuppressedArtistsInput {
  swipeHistory: ReadonlyArray<SoftSuppressSwipe>;
  threshold?: number;
}

export function softSuppressedArtists(_input: SoftSuppressedArtistsInput): Set<string> {
  throw new Error("softSuppressedArtists: not implemented");
}
