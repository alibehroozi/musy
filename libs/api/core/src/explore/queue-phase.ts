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

// QueuePhaseLiteral retains "artist-refinement" for backward compatibility with
// stored queue documents written before the taste-driven adjacency feature.
// phaseFor no longer emits it — all post-discovery rebuilds use "personalized".
export type QueuePhaseLiteral = "discovery" | "artist-refinement" | "personalized";

/**
 * Pure decision: which sourcing phase should drive the next queue build
 * for a user, given their current profile and total swipe count?
 *
 * Per LOGIC-15 (taste-driven adjacency update): profile *existence* is the
 * only gate — any non-null profile goes straight to "personalized". The
 * "artist-refinement" intermediate phase is retired from the runtime; the
 * enum value stays in the contract for backward compat with stored documents.
 *
 * Phases:
 *   - "discovery":   no profile yet.
 *   - "personalized": profile exists (any number of strong-signal artists).
 *
 * The function is identity-free, deterministic, and never reads time or
 * randomness — every test just hands it a profile and an integer (API-35).
 */
export function phaseFor(
  profile: TasteProfile | null,
  totalSwipeCount: number,
): "discovery" | "personalized" {
  void totalSwipeCount;
  if (profile === null) return "discovery";
  return "personalized";
}
