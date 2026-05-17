import type { TasteProfile } from "@moc/contracts";

// An artist counts as "strong signal" once the profile scores them above
// this threshold. Below the cutoff their presence in the profile is
// likely noise from a single right-swipe rather than a real preference.
export const STRONG_ARTIST_SCORE_THRESHOLD = 0.5;

// Distinct strong-signal artists needed to leave artist-refinement.
export const STRONG_ARTISTS_TO_LEAVE_ARTIST_REFINEMENT = 8;

// Per LOGIC-39: the swipe count that activates the first taste-profile build
// AND the first auto-bucket build. Hosted here (a pure value with no NestJS
// deps) so every consumer — profile builder, queue builder's discovery-exit
// await, auto-bucket signal-pool floor — imports the same number without
// forming a value-level import cycle between Nest services.
export const SWIPE_TRIGGER_THRESHOLD = 20;

export type QueuePhaseLiteral = "discovery" | "artist-refinement" | "personalized";

/**
 * Pure decision: which sourcing phase should drive the next queue build
 * for a user, given their current profile and total swipe count?
 *
 * Per LOGIC-15 (May 2026 weakening): profile *existence* is the discovery
 * exit gate — not a genre-count threshold. Before this change, leaving
 * discovery required ≥ 3 distinct liked genres at score ≥ 0.2, which
 * deadlocked users whose 20-swipe cold-start sample didn't surface that
 * many genres confidently. A thin artist-refinement batch beats a re-run
 * of cold-start the user already saw.
 *
 * Phases ordered by maturity:
 *   - "discovery": no profile yet.
 *   - "artist-refinement": profile exists, < 8 strong-signal artists.
 *   - "personalized": ≥ 8 strong-signal artists.
 *
 * The function is identity-free, deterministic, and never reads time or
 * randomness — every test just hands it a profile and an integer.
 */
export function phaseFor(profile: TasteProfile | null, totalSwipeCount: number): QueuePhaseLiteral {
  void totalSwipeCount;
  if (profile === null) return "discovery";
  const strongArtists = profile.artists.filter(
    (a) => a.score >= STRONG_ARTIST_SCORE_THRESHOLD,
  ).length;
  if (strongArtists < STRONG_ARTISTS_TO_LEAVE_ARTIST_REFINEMENT) return "artist-refinement";
  return "personalized";
}
