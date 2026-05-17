import { z } from "zod";

// ── Taste buckets (epic Taste — feature 01) ──────────────────────────
//
// A "bucket" is a curated playlist-shaped grouping of songs. Two
// flavors: "auto" buckets are built by the daily auto-bucket job
// (feature 04) from the user's high-score interest_scores; "custom"
// buckets are built on demand from a free-text prompt (feature 05).
// Every bucket has a build lifecycle — `building` while the job runs,
// `ready` once songs are populated, `failed` if the job errors out.
//
// `GET /api/me/taste/profile` is the single read endpoint that returns
// the user's buckets. The shape is locked in feature 01 so subsequent
// backend (04, 05, 06) and UI (07, 08) features can implement against
// a stable contract. Until the auto / custom builders land, the
// endpoint always returns `{ buckets: [] }` — no UI consumes it yet.

export const BucketKind = z.enum(["auto", "custom"]);
export type BucketKind = z.infer<typeof BucketKind>;

export const BucketState = z.enum(["ready", "building", "failed"]);
export type BucketState = z.infer<typeof BucketState>;

export const TasteBucket = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  name: z.string().min(1).max(60),
  description: z.string().max(200).nullable(),
  kind: BucketKind,
  state: BucketState,
  promptText: z.string().nullable(),
  errorReason: z.string().nullable(),
  createdAt: z.string().datetime(),
  lastBuiltAt: z.string().datetime(),
  // API-28: server-computed cover artwork URL — the snapshot.artworkUrl of
  // the highest-score bucket_song_scores row for this bucket. Null when the
  // bucket has no scored songs yet (e.g. state: "building"), when the top
  // row's artworkUrl is null, or when it fails URL parsing. The FE falls
  // back to a deterministic gradient cover when this is null.
  coverArtworkUrl: z.string().url().nullable(),
});
export type TasteBucket = z.infer<typeof TasteBucket>;

// Named `TasteBucketsResponse` rather than the spec's draft
// `TasteProfileResponse` to avoid colliding with the explore-tab's
// `TasteProfileResponse` (the user's LLM-derived genre / artist
// profile, owned by the explore feature). The new Taste tab's
// "profile" page lists buckets, which is what this wrapper carries.
export const TasteBucketsResponse = z.object({
  buckets: z.array(TasteBucket),
});
export type TasteBucketsResponse = z.infer<typeof TasteBucketsResponse>;

// ── Context scores (epic Taste — feature 02) ─────────────────────────
//
// Every interaction (right-swipe, left-swipe, save, listen-completed)
// writes contextual-scoring rows along four axes: weekday, time-of-day,
// month, and bucket. The first three are stored in `context_scores`;
// the fourth lives in `bucket_song_scores` (locked in feature 01).
//
// These enums are the closed value sets for each time-context axis —
// the Zod schemas double as the source of truth for the Mongoose
// schema's `enum` constraint and for any future read endpoint.

export const ContextAxis = z.enum(["weekday", "timeOfDay", "month"]);
export type ContextAxis = z.infer<typeof ContextAxis>;

export const WeekdayValue = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
export type WeekdayValue = z.infer<typeof WeekdayValue>;

export const TimeOfDayValue = z.enum(["morning", "afternoon", "evening", "night"]);
export type TimeOfDayValue = z.infer<typeof TimeOfDayValue>;

export const MonthValue = z.enum([
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
]);
export type MonthValue = z.infer<typeof MonthValue>;

export const ScoringEventType = z.enum(["right-swipe", "left-swipe", "save", "listen-completed"]);
export type ScoringEventType = z.infer<typeof ScoringEventType>;

// ── Auto-bucket builder (epic Taste — feature 04) ─────────────────────
//
// The LLM output parsed and validated before writing buckets +
// bucket_song_scores. Both arrays may be empty (the LLM found nothing
// to classify). A song can appear in multiple assignments rows (one per
// bucket it belongs to, each with its own initialScore).

export const BucketBuilderLLMOutput = z.object({
  newBuckets: z.array(
    z.object({
      name: z.string().min(1).max(60),
      description: z.string().max(200),
    }),
  ),
  assignments: z.array(
    z.object({
      songKey: z.string().min(1),
      bucket: z.string().min(1).max(60),
      initialScore: z.number().int().min(0).max(100),
    }),
  ),
});
export type BucketBuilderLLMOutput = z.infer<typeof BucketBuilderLLMOutput>;

// ── Custom-mix builder (epic Taste — feature 05) ──────────────────────
//
// The user-prompted "build me a mix" backend. Three contracts:
//
//   - `CustomMixRequest`: the POST body. `promptText` is the free-text
//     prompt the user typed; we cap at 500 chars so the LLM prompt body
//     stays bounded (AI-16) and the user sees a clean validation error
//     before we touch the database.
//   - `CustomMixCreatedResponse`: the synchronous response. Returned in
//     a microtask of the pre-insert; the LLM build is fire-and-forget.
//     Both ids are uuid v4 so the client can correlate the eventual
//     `state: "ready"` flip via `GET /me/taste/profile` polling.
//   - `CustomMixLLMOutput`: the validated Anthropic response shape.
//     `sourceBuckets` is optional per song — when present, it records
//     which auto-bucket ids the LLM said it drew the song from, used
//     by feature 06 to attribute skips.
export const CustomMixRequest = z.object({
  promptText: z.string().min(1).max(500),
});
export type CustomMixRequest = z.infer<typeof CustomMixRequest>;

export const CustomMixCreatedResponse = z.object({
  jobId: z.string().uuid(),
  bucketId: z.string().uuid(),
});
export type CustomMixCreatedResponse = z.infer<typeof CustomMixCreatedResponse>;

export const CustomMixLLMOutput = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(200),
  songs: z.array(
    z.object({
      songKey: z.string().min(1),
      initialScore: z.number().int().min(0).max(100),
      sourceBuckets: z.array(z.string().min(1)).optional(),
    }),
  ),
});
export type CustomMixLLMOutput = z.infer<typeof CustomMixLLMOutput>;
