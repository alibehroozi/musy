import { z } from "zod";
import { SongSnapshot } from "./search.js";

// ── Swipe ledger (feature 03) ────────────────────────────────────────
//
// `POST /api/explore/swipe` records a Tinder-style verdict for the top
// card on the Explore tab. A right-swipe is a strong "I like this"
// signal (matches saved=8); a left-swipe stays in the ledger only.
// userId is always derived from the session — never from the body.

export const SwipeDirection = z.enum(["right", "left"]);
export type SwipeDirection = z.infer<typeof SwipeDirection>;

export const SwipeRequest = z.object({
  snapshot: SongSnapshot,
  direction: SwipeDirection,
});
export type SwipeRequest = z.infer<typeof SwipeRequest>;

// ── Taste profile (feature 04) ───────────────────────────────────────
//
// `GET /api/explore/profile` returns the user's current taste profile
// or `null` if they have not yet hit the build threshold. The build
// is asynchronous (kicked off after a successful swipe write); this
// endpoint never invokes the LLM directly.

export const TempoBucket = z.enum(["slow", "mid", "fast"]);
export type TempoBucket = z.infer<typeof TempoBucket>;

export const RemixPreference = z.enum(["original", "remix-friendly", "remix-only"]);
export type RemixPreference = z.infer<typeof RemixPreference>;

const RankedItem = z.object({
  name: z.string().min(1),
  score: z.number().min(0).max(1),
});

export const TasteProfile = z.object({
  userId: z.string().min(1),
  genres: z.array(RankedItem),
  artists: z.array(RankedItem),
  tempoBucket: TempoBucket.nullable(),
  remixPreference: RemixPreference.nullable(),
  summaryText: z.string(),
  lastBuiltAt: z.string().datetime(),
  swipeCountAtLastBuild: z.number().int().nonnegative(),
});
export type TasteProfile = z.infer<typeof TasteProfile>;

// `null` when the user is below the build threshold (< 20 swipes).
export const TasteProfileResponse = TasteProfile.nullable();
export type TasteProfileResponse = z.infer<typeof TasteProfileResponse>;

// Shape the LLM is asked to emit (parsed via JSON.parse of the
// model's text content). Keeps userId/lastBuiltAt out — those are
// owned by the server, not the model.
export const TasteProfileLLMOutput = z.object({
  genres: z.array(RankedItem),
  artists: z.array(RankedItem),
  tempoBucket: TempoBucket.nullable(),
  remixPreference: RemixPreference.nullable(),
  summaryText: z.string(),
});
export type TasteProfileLLMOutput = z.infer<typeof TasteProfileLLMOutput>;

// ── Explore queue (feature 05) ───────────────────────────────────────
//
// `GET /api/explore/next` returns the user's pre-fetched swipe queue
// for the Explore tab. Three phases drive sourcing:
//   - "discovery"          — committed seed-genre snapshots, no provider
//                            calls, used until the user has right-swiped
//                            in ≥ 3 distinct genres.
//   - "artist-refinement"  — provider search per liked genre, [1 common,
//                            2 niche] split, used until the profile has
//                            ≥ 8 strong-signal artists.
//   - "personalized"       — heuristic candidate pool reranked by an LLM
//                            using the profile summary.
// `partial: true` means the queue is shorter than `count` (provider
// outage degraded the build). It is never empty when any candidate
// could be sourced.

export const QueuePhase = z.enum(["discovery", "artist-refinement", "personalized"]);
export type QueuePhase = z.infer<typeof QueuePhase>;

export const NextResponse = z.object({
  items: z.array(SongSnapshot),
  phase: QueuePhase,
  partial: z.boolean(),
  // API-20: true iff a queue rebuild is currently in flight for the user
  // at the moment the response is computed. The FE uses this to decide
  // whether to show a loading state and poll, vs. surface a genuine empty
  // state. Idempotent server-side rebuild (API-21) keeps the poll cheap.
  buildingQueue: z.boolean(),
});
export type NextResponse = z.infer<typeof NextResponse>;
