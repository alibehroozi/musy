import type { TasteProfile } from "@moc/contracts";

// A "liked genre" is a profile genre with a non-trivial score. Below this
// the genre signal is too weak to count toward the discovery → artist-
// refinement transition.
export const LIKED_GENRE_SCORE_THRESHOLD = 0.2;

// Distinct liked genres needed to leave the discovery phase.
export const DISTINCT_LIKED_GENRES_TO_LEAVE_DISCOVERY = 3;

// An artist counts as "strong signal" once the profile scores them above
// this threshold. Below the cutoff their presence in the profile is
// likely noise from a single right-swipe rather than a real preference.
export const STRONG_ARTIST_SCORE_THRESHOLD = 0.5;

// Distinct strong-signal artists needed to leave artist-refinement.
export const STRONG_ARTISTS_TO_LEAVE_ARTIST_REFINEMENT = 8;

export type QueuePhaseLiteral = "discovery" | "artist-refinement" | "personalized";

/**
 * Pure decision: which sourcing phase should drive the next queue build
 * for a user, given their current profile and total swipe count? The
 * phases are ordered by maturity:
 *   - "discovery": no profile, or fewer than 3 liked genres known.
 *   - "artist-refinement": ≥ 3 liked genres but < 8 strong-signal artists.
 *   - "personalized": both thresholds cleared.
 *
 * The function is identity-free, deterministic, and never reads time or
 * randomness — every test just hands it a profile and an integer.
 */
export function phaseFor(profile: TasteProfile | null, totalSwipeCount: number): QueuePhaseLiteral {
  void totalSwipeCount;
  if (profile === null) return "discovery";
  const likedGenres = profile.genres.filter((g) => g.score >= LIKED_GENRE_SCORE_THRESHOLD);
  const distinctLikedGenres = new Set(likedGenres.map((g) => g.name)).size;
  if (distinctLikedGenres < DISTINCT_LIKED_GENRES_TO_LEAVE_DISCOVERY) return "discovery";
  const strongArtists = profile.artists.filter(
    (a) => a.score >= STRONG_ARTIST_SCORE_THRESHOLD,
  ).length;
  if (strongArtists < STRONG_ARTISTS_TO_LEAVE_ARTIST_REFINEMENT) return "artist-refinement";
  return "personalized";
}
