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
