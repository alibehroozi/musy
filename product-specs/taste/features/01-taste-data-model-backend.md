---
epic: taste
status: pending
estimated-invariants: 5
---

# Feature 01: Taste data model backend

## Product description

Lay the foundation for the Taste epic: a new `taste` NestJS module, the Zod contracts for buckets and bucket-song scores, two new Mongoose collections (`buckets` and `bucket_song_scores`), and a single read endpoint `GET /api/me/taste/profile` that returns the user's bucket list. Nothing populates buckets in this feature — the endpoint returns an empty buckets array for every user. The point is to **lock the response shape** so subsequent backend features (04, 05, 06) and UI features (07, 08) can implement against a stable contract.

A `buckets` document records: a stable `id`, the owning `userId`, the AI-generated `name`, an optional `description`, a `kind` (`"auto" | "custom"`), a `state` (`"ready" | "building" | "failed"`), an optional `promptText` for custom mixes, an `errorReason` for failed builds, and timestamps. A `bucket_song_scores` document records the per-`(userId, bucketId, songKey)` score plus a denormalized `snapshot` so the bucket-detail page (feature 08) doesn't need a second-tier join.

## User behavior

Backend-only — no UI in this feature. One user-observable side effect: `GET /api/me/taste/profile` returns 200 with `{ buckets: [] }` for any logged-in user. After future features land (04, 05) the same endpoint returns real buckets without any endpoint-shape change.

Manual exercise:

1. Sign in.
2. `GET /api/me/taste/profile` → 200, body `{ buckets: [] }`.
3. Manually insert a `buckets` doc via Mongo Express → re-fetch → bucket appears in the response.
4. Without a session cookie → 401 + `ErrorResponse`.
5. Sign in as user B; via Mongo Express insert a `buckets` doc whose `userId` is user A's id; user B's `GET /api/me/taste/profile` does **not** return that bucket.

**Failure modes:**

- Mongo down → 500 + `ErrorResponse` (via existing `AllExceptionsFilter`); the endpoint never throws unhandled.
- Mongo returns a doc with a missing required field → repository filters it defensively and structured-logs.

**Empty / first-run state:** `GET /api/me/taste/profile` returns `{ buckets: [] }` for users with no buckets.

## Design

**Visual mockup:** none — backend feature.
**DS components used:** none.
**DS components required but missing:** none.
**Layout notes:** none.

## Backend

**New endpoints:**

- `GET /api/me/taste/profile` (auth-required) — returns 200 with `{ buckets: TasteBucket[] }` matching the `TasteProfileResponse` Zod schema.

**New / changed Mongoose collections:**

- `buckets` (new) — fields:
  - `id: string` (uuid v4)
  - `userId: string`
  - `name: string` (≤ 60 chars)
  - `description: string` (≤ 200 chars; optional)
  - `kind: "auto" | "custom"`
  - `state: "ready" | "building" | "failed"`
  - `promptText: string | null` — populated only for custom mixes
  - `errorReason: string | null` — populated only when `state === "failed"`
  - `createdAt: Date`
  - `lastBuiltAt: Date`
  - Compound index `(userId, id)` for scoped reads; index on `(userId, state)` for the polling read-path of building buckets.

- `bucket_song_scores` (new) — fields:
  - `userId: string`
  - `bucketId: string`
  - `songKey: string`
  - `snapshot: SongSnapshot` (same shape used everywhere else in the codebase)
  - `score: number` (integer 0..100)
  - `lastUpdatedAt: Date`
  - Unique compound index `(userId, bucketId, songKey)`.
  - Compound index `(userId, bucketId, score: -1)` for top-N reads (bucket cover + ordered song list).

**New env vars:** none.

## Tooling

**New deps:** none.
**External services:** none.

## Privacy

- User → API: a session cookie. No new body fields on this endpoint.
- API → third party: nothing.
- API → LLM: nothing in this feature.
- Stays server-only: every `buckets` and `bucket_song_scores` document; the `userId`.

## Acceptance criteria

- [ ] `GET /api/me/taste/profile` returns 401 + `ErrorResponse` without a session cookie.
- [ ] `GET /api/me/taste/profile` returns 200 + `{ buckets: [] }` for a user with no buckets.
- [ ] After inserting a `buckets` doc for `userId = X` via Mongo Express, `GET /api/me/taste/profile` for that user returns the doc with all fields matching `TasteBucket`.
- [ ] A bucket belonging to user A is **never** returned to user B (cross-user IDOR rejected).
- [ ] The response body matches `TasteProfileResponse` exactly — no extra fields, no missing fields, no leaked Mongo internals (`_id`, `__v`, etc.).
- [ ] `bucket_song_scores` collection exists in Mongo with the unique compound index `(userId, bucketId, songKey)`.

## Suggested invariants

The agent in `/new-invariant` will refine these — seeds, not commitments:

- **DATA-XX:** Every `buckets` document has `id`, `userId`, `name`, `kind ∈ {auto, custom}`, `state ∈ {ready, building, failed}`, `createdAt`, `lastBuiltAt`. The `(userId, id)` index exists.
- **DATA-XX:** Every `bucket_song_scores` document has `userId`, `bucketId`, `songKey`, `snapshot`, `score`; `(userId, bucketId, songKey)` is unique; `score ∈ [0, 100]` (integer).
- **API-XX:** `GET /api/me/taste/profile` returns 401 without a session; with a session it returns 200 + a body matching `TasteProfileResponse`.
- **SEC-XX:** `GET /api/me/taste/profile` for user A never returns any bucket whose `userId !== A` (extends `SEC-06`/`SEC-09` patterns — all reads scoped by authenticated `userId`).
- **PRIVACY-XX:** No LLM call, no third-party HTTP call is made during a `GET /api/me/taste/profile` request.

## Implementation hint for /new-feature

This file is self-contained.

**Where things live (per `ARCHITECTURE.md` layering):**

- **Contracts** in `libs/shared/contracts/src/taste.ts`:
  - `BucketKind = z.enum(["auto", "custom"])`
  - `BucketState = z.enum(["ready", "building", "failed"])`
  - `TasteBucket = z.object({ id, userId, name, description: z.string().nullable(), kind, state, promptText: z.string().nullable(), errorReason: z.string().nullable(), createdAt: z.string().datetime(), lastBuiltAt: z.string().datetime() })`
  - `TasteProfileResponse = z.object({ buckets: z.array(TasteBucket) })`
  - Re-export from `libs/shared/contracts/src/index.ts`.
- **NestJS module** in `apps/api/src/modules/taste/`:
  - `taste.module.ts`
  - `taste.controller.ts` — `GET /me/taste/profile`
  - `taste.service.ts` — reads buckets for the authenticated user
  - `buckets.schema.ts` + `buckets.repository.ts`
  - `bucket-song-scores.schema.ts` + `bucket-song-scores.repository.ts`
- Wire `TasteModule` into `apps/api/src/app.module.ts`.

No new env vars — hard rule #9 cascade not triggered.

**Suggested commit order:**

1. `spec: add DATA-XX (×2), API-XX, SEC-XX, PRIVACY-XX invariants for taste data model`
2. `test(invariants): stub the new invariants it.todo`
3. `feat(contracts): add TasteBucket and TasteProfileResponse Zod schemas`
4. `feat(api): add taste module skeleton + buckets and bucket_song_scores schemas + GET /me/taste/profile`
5. tests turning `it.todo` into real assertions
