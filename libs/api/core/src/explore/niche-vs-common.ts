export const NICHE_THRESHOLD = 10_000;
export const COMMON_THRESHOLD = 1_000_000;

export type Popularity = "niche" | "mid" | "common";

/**
 * Pure helper that classifies a provider search hit by its play /
 * listen count. Used by the artist-refinement phase to split candidates
 * into [1 common, 2 niche] per genre. The thresholds are constants —
 * the helper never calls a model and never mutates input.
 *
 * Listen counts vary wildly across providers; the niche threshold is
 * deliberately set so a track with no popularity metadata at all is
 * treated as "niche" (the default-pessimistic path: an unknown track
 * is more likely an obscure one than a hit).
 */
export function classifyByListenCount(listenCount: number | null | undefined): Popularity {
  if (listenCount === null || listenCount === undefined) return "niche";
  if (!Number.isFinite(listenCount) || listenCount < 0) return "niche";
  if (listenCount < NICHE_THRESHOLD) return "niche";
  if (listenCount >= COMMON_THRESHOLD) return "common";
  return "mid";
}
