---
epic: taste
status: done
estimated-invariants: 9
implemented-in-pr: https://github.com/alibehroozi/musy/pull/45
---

# Feature 05: Custom mix job backend

## Product description

User-triggered async pipeline: the user types a free-text prompt ("rainy day jazz", "hyperpop workout", "music for slow Sunday cooking") and an LLM builds a custom-mix bucket on the fly. The flow:

1. Client `POST /api/me/taste/custom-mix` with `{ promptText: string }`.
2. Server validates the prompt (length, etc.), inserts a new `buckets` row with `kind: "custom"`, `state: "building"`, `promptText`, and returns `{ jobId, bucketId }` immediately (200, < 200 ms).
3. Inside a fire-and-forget Promise, the server:
   a. Reads the user's **touched-songs pool** — songs with at least one positive signal (right-swiped ∪ saved ∪ listened-completed). Capped at N=400 newest-first.
   b. Reads the user's current bucket names (for the LLM to reference as source-buckets).
   c. Composes the prompt and calls Anthropic Claude Sonnet 4.6.
   d. Parses the LLM output (Zod), then:
   - Updates the `buckets` row to `state: "ready"`, sets `name`, `description`, `lastBuiltAt`.
   - Inserts `bucket_song_scores` rows for each picked song with the LLM-supplied initial score.
   - Persists a `custom_mix_jobs` doc capturing the `sourceBuckets` map (per song → which auto-buckets the LLM said it drew from) for skip-attribution in feature 06.
4. On any failure, the `buckets` row flips to `state: "failed"`, `errorReason` is set, and the row is left in place (the client surfaces this; the user can dismiss or retry by submitting a fresh prompt).

The client polls `GET /api/me/taste/profile` (feature 01) on a 3 s cadence with 8 s backoff after 30 s elapsed, giving up after 2 min and showing a failure state — but the polling protocol itself is owned by feature 07 (UI). Backend just guarantees that the bucket's `state` flips truthfully and exactly once per build.

## User behavior

Manual exercise:

1. Sign in. Make sure the user has ≥ 1 auto-bucket (run a few right-swipes + wait for feature 04's build).
2. `POST /api/me/taste/custom-mix` with `{"promptText": "dreamy late-night focus"}` → 200 with `{ jobId, bucketId }`.
3. Immediately `GET /api/me/taste/profile` → the new bucket is present with `state: "building"`, `kind: "custom"`, `promptText: "dreamy late-night focus"`.
4. Wait ~3–15 s. Poll again → bucket is `state: "ready"` with `name` (LLM-generated, e.g. "Dreamy late-night focus"), `description`, and `bucket_song_scores` rows for the picked songs.
5. Check `custom_mix_jobs` in Mongo Express → one doc with `jobId`, `bucketId`, `promptText`, `state: "completed"`, `sourceBuckets` map (per `songKey` → list of `bucketId`s the LLM used).
6. Submit a second prompt → second bucket created; first one untouched.
7. Submit a prompt with a deliberately impossible request ("songs in languages I don't know") → expect either a successful but possibly small bucket OR a `state: "failed"` row.
8. Try `POST /api/me/taste/custom-mix` from user A's session with `userId` of user B in the body → ignored; bucket is always created for the authenticated session user.

**Failure modes:**

- Empty / whitespace-only prompt → 400 + `ErrorResponse`. No bucket created.
- Prompt > 500 chars → 400 + `ErrorResponse`.
- User has zero touched songs (cold start) → 422 + `ErrorResponse`: "Build your Taste first — swipe in Explore to add songs to your pool."
- Anthropic error → `buckets.state = "failed"`, `errorReason` set, `custom_mix_jobs.state = "failed"`. Polling client sees the failure.
- LLM emits malformed JSON → same as Anthropic error.
- LLM picks `songKeys` not in the user's pool → drop them; if the result is empty, mark `failed` with `errorReason: "model_returned_no_valid_songs"`.
- Rate limit (≥ 5 in-flight custom-mix jobs for the same user) → 429 + `ErrorResponse`: "Wait for your current mix to finish."

**Empty / first-run state:** users with no positive signal cannot generate mixes (422 above).

## Design

**Visual mockup:** none — backend feature.
**DS components used:** none.
**DS components required but missing:** none.
**Layout notes:** none.

## Backend

**New endpoints:**

- `POST /api/me/taste/custom-mix` (auth-required) — body `{ promptText: string (1..500 chars, trimmed) }`. Returns 200 + `{ jobId: string (uuid), bucketId: string (uuid) }` after the bucket row is inserted in `state: "building"`. The LLM call happens async.

**New / changed Mongoose collections:**

- `buckets` (existing) — this feature is the first writer for `kind: "custom"` rows.
- `bucket_song_scores` (existing) — same pattern as feature 04: initial-score-on-insert; do not overwrite existing rows. (For a fresh custom bucket, no rows exist yet, so this is always an insert path.)
- `custom_mix_jobs` (new) — fields:
  - `jobId: string` (uuid)
  - `userId: string`
  - `bucketId: string`
  - `promptText: string` (≤ 500 chars)
  - `state: "building" | "completed" | "failed"`
  - `errorReason: string | null`
  - `sourceBuckets: Record<songKey, string[]>` — per-song, which auto-bucket ids the LLM treated as the source. Used by feature 06 to attribute skips.
  - `startedAt: Date`
  - `completedAt: Date | null`
  - Unique index on `jobId`.
  - Compound index `(userId, state)` so the rate-limit guard can count in-flight jobs cheaply.

**Concurrency / rate-limit:**

- In-flight `Map<userId, Set<jobId>>` in `CustomMixService` for fast in-process count + a Mongo `(userId, state: "building")` count for cross-process safety. Hard cap at 5 concurrent per user. (Five is intentionally generous since a build takes < 30 s typical.)

**Build pipeline (in `apps/api/src/modules/taste/custom-mix.service.ts`):**

1. Validate prompt (length, non-empty after trim).
2. Read positive-signal pool (same query as feature 04, deduped by `songKey`, cap 400 newest-first).
3. If pool is empty → 422 before any DB writes.
4. Insert `buckets` row (`state: "building"`, `kind: "custom"`, `promptText`, `name: ""` placeholder, `description: ""`) and `custom_mix_jobs` row (`state: "building"`).
5. Return `{ jobId, bucketId }` to the client.
6. **Async (Promise.catch attached):**
   a. Compose prompt (see "Prompt shape").
   b. Call Anthropic.
   c. Parse against `CustomMixLLMOutput` Zod schema.
   d. Filter `songKeys` against the pool — drop any that weren't in it.
   e. If filtered set is empty → mark `buckets` as `failed` with `errorReason: "model_returned_no_valid_songs"`; mark `custom_mix_jobs` as `failed`; return.
   f. Update `buckets` row with LLM-supplied `name` (trim, ≤ 60 chars), `description` (≤ 200), `state: "ready"`, `lastBuiltAt: now`.
   g. Insert `bucket_song_scores` rows for each picked song.
   h. Update `custom_mix_jobs.state: "completed"`, `completedAt: now`, `sourceBuckets` map.

**Prompt shape:**

System prompt (cached): instructions + JSON schema for output + soft guidance ("pick 10–30 songs", "name should match the mood the user described, sentence case, ≤ 60 chars"). **No per-user data.**

User message (not cached): JSON-encoded `{ promptText, pool: [{ songKey, title, artist, kind, generalScore }], buckets: [{ id, name, description }] }`. **No `userId`, no `email`, no IP, no session token, no event timestamps.** `generalScore` is computed server-side via the `generalScore` helper (feature 02) at request time so the LLM sees the user's current contextual ranking — but the score itself is just an integer, not identifying.

**New env vars:** none. Reuses `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`.

## Tooling

**New deps:** none. Reuses Anthropic client and Zod.

**External services:** Anthropic API. Per-call cost ~$0.001 (Sonnet 4.6 + prompt caching).

## Privacy

- User → API: a `promptText` string. The user controls this content — they may type identifying info ("songs to play for my friend Bob") but the server treats it as opaque user input and does not parse / extract identity from it. We forward it verbatim to the LLM. **The user is responsible for their own prompt text.**
- API → Anthropic prompt: `{ promptText, pool, buckets }` only. **Specifically excluded:** `userId`, `email`, IP, session cookie, swipe / save / listen timestamps. The `pool` and `buckets` shapes mirror feature 04.
- Stays server-only: `custom_mix_jobs`, `sourceBuckets` map, the API key.

## Acceptance criteria

- [ ] `POST /api/me/taste/custom-mix` returns 401 + `ErrorResponse` without a session cookie.
- [ ] An empty / whitespace prompt returns 400 + `ErrorResponse`.
- [ ] A 501-char prompt returns 400 + `ErrorResponse`.
- [ ] A user with no positive signal returns 422 + `ErrorResponse`; no `buckets` row is created.
- [ ] On success, the response is 200 + `{ jobId, bucketId }` within 200 ms, before the LLM is called.
- [ ] Immediately after the POST, `GET /api/me/taste/profile` returns the new bucket with `state: "building"`.
- [ ] After the async build completes, the bucket's `state` flips to `"ready"` exactly once and `bucket_song_scores` rows exist for the picked songs.
- [ ] On Anthropic error, the bucket's `state` flips to `"failed"` with a non-null `errorReason`; no `bucket_song_scores` rows are written.
- [ ] On LLM emitting a `songKey` not in the pool, that song is dropped; if all are dropped, the bucket goes to `"failed"`.
- [ ] Submitting 6 mixes in parallel for the same user → the 6th returns 429.
- [ ] No outgoing Anthropic request body contains the user's `userId` or `email`.
- [ ] User A's mix is never returned to user B via any endpoint.
- [ ] `custom_mix_jobs.sourceBuckets` is populated with the LLM-stated per-song source-bucket map (used in feature 06).

## Suggested invariants

The agent in `/new-invariant` will refine these — seeds, not commitments:

- **AI-XX:** The Anthropic prompt body for custom-mix builds never contains the user's `userId`, `email`, IP, session token, or any event timestamp.
- **AI-XX:** The custom-mix prompt-cache key depends only on the system prompt + the deterministic user-message JSON bytes.
- **AI-XX:** The user-message prompt is bounded: ≤ 500 chars `promptText`, ≤ 400 songs in `pool`. Inputs above the limit are rejected (400) or truncated (pool, newest-first).
- **DATA-XX:** Every `custom_mix_jobs` document has `jobId` (unique), `userId`, `bucketId`, `promptText`, `state ∈ {building, completed, failed}`, `startedAt`. `state: "failed"` requires `errorReason`. `state: "completed"` requires `completedAt`.
- **DATA-XX:** A `buckets` row with `kind: "custom"` always has a non-null `promptText`. An `auto` bucket always has `promptText: null`.
- **API-XX:** `POST /api/me/taste/custom-mix` rate-limits at 5 concurrent in-flight per user (429 on the 6th).
- **API-XX:** The POST response body matches `CustomMixCreatedResponse = { jobId, bucketId }`; the controller does not wait on the LLM call.
- **SEC-XX:** The bucket created always has `userId === session.user.uid`, regardless of any body parameter (extends `SEC-09`).
- **PRIVACY-XX:** The custom-mix build prompt's user message is a function only of `(promptText, pool, buckets)` derived from our DB and the request body — no fields outside that set ever appear in any prompt body.

## Implementation hint for /new-feature

**Where things live:**

- **Contracts** in `libs/shared/contracts/src/taste.ts` (extend):
  - `CustomMixRequest = z.object({ promptText: z.string().min(1).max(500) })`
  - `CustomMixCreatedResponse = z.object({ jobId: z.string().uuid(), bucketId: z.string().uuid() })`
  - `CustomMixLLMOutput = z.object({ name: z.string().min(1).max(60), description: z.string().max(200), songs: z.array(z.object({ songKey: z.string(), initialScore: z.number().int().min(0).max(100), sourceBuckets: z.array(z.string()).optional() })) })`
- **Pure helpers** in `libs/api/core/taste/`:
  - `custom-mix-prompt.ts` — `buildCustomMixPrompt({ promptText, pool, buckets }) → { system, userMessage }`. Pure / deterministic.
- **NestJS** in `apps/api/src/modules/taste/`:
  - `custom-mix.controller.ts` — `POST /me/taste/custom-mix`.
  - `custom-mix.service.ts` — pre-insert + fire-and-forget orchestration above.
  - `custom-mix-jobs.schema.ts` + `custom-mix-jobs.repository.ts`.

**Real-upstream policy:** same as feature 04 — Anthropic tests hit the real API; the 5xx and timeout tests are the explicit mocks, quoting this spec line.

**Suggested commit order:**

1. `spec: add AI-XX (×3), DATA-XX (×2), API-XX (×2), SEC-XX, PRIVACY-XX invariants for custom mix`
2. `test(invariants): stub the new invariants it.todo + unit tests for buildCustomMixPrompt (red)`
3. `feat(contracts): add CustomMixRequest / CustomMixCreatedResponse / CustomMixLLMOutput`
4. `feat(api-core): add buildCustomMixPrompt helper`
5. `feat(api): add custom_mix_jobs schema + CustomMixService + POST /me/taste/custom-mix route`
6. tests turning `it.todo` into real assertions
