---
epic: taste
status: pending
estimated-invariants: 8
---

# Feature 04: Auto bucket builder backend

## Product description

The heart of the Taste epic. After the existing `profile-builder.service.ts` completes (every ~20 swipes or 24 h, per the Explore epic), a new `BucketBuilderService` fires a second Claude call that **classifies the user's recent positive signal into named buckets** and writes the results to the collections introduced in feature 01:

- New buckets get inserted into `buckets` (`kind: "auto"`, `state: "ready"`).
- Each `(song, bucket)` assignment gets an initial score in `bucket_song_scores`, set by the LLM (0..100) so the system knows which bucket a song belongs to _more strongly_.

The build's **input** is built from the same data sources the existing taste-profile builder uses, but with a positive-signal-only filter:

- Right-swiped songs (from `swipes`)
- Saved songs (from `interest_scores`, `lastEventType: "saved"`)
- Listened-to-completion songs (from `listening_events` with `playedPct >= 0.5`)
- The user's **current bucket names** (so the LLM prefers reusing existing buckets over inventing new ones — soft cap at ~30 total per user)

The build's **output** is a JSON object (parsed via a Zod schema) shaped:

```ts
{
  newBuckets: Array<{ name: string, description: string }>,
  assignments: Array<{ songKey: string, bucket: string, initialScore: number /* 0..100 */ }>
}
```

A single song can appear in multiple `assignments` rows — one per bucket it belongs to, each with its own `initialScore`. The server then:

1. Creates any `newBuckets` it doesn't already have (matching by name, case-insensitive, after trimming).
2. Upserts `bucket_song_scores` rows for each assignment. **If a row already exists, its score is left alone** — we don't reset progress on every rebuild; only first-time assignments seed an initial score. (Subsequent right-swipes / saves / listens via feature 02 modify the score.)

Buckets are **never deleted** — even if the LLM stops assigning songs to "Late night drives" on a subsequent build, the bucket persists with the songs it already had. (Manual deletion / rename is out of scope for the epic.)

Trigger: fire-and-forget after `profile-builder.maybeBuild(userId)` completes successfully. Same in-flight `Map<userId, Promise>` pattern to prevent concurrent builds.

## User behavior

Backend-only in this feature. Observable side effect: after swiping right ~20 times on similar music, the user's `GET /api/me/taste/profile` starts returning buckets (consumed visually in feature 07).

Manual exercise:

1. Sign in. `GET /api/me/taste/profile` → `{ buckets: [] }`.
2. Right-swipe 20+ songs across a couple of distinct moods (e.g., 10 chill electronic + 10 fast punk).
3. Swipe #20 triggers `profile-builder.maybeBuild` (existing). Soon after it completes, `BucketBuilderService.maybeBuild` fires.
4. Watch logs: `auto_bucket_build_started`, then `auto_bucket_build_completed` (or `_failed`).
5. `GET /api/me/taste/profile` now returns ≥ 1 bucket with `kind: "auto"` and `state: "ready"`.
6. Inspect `buckets` and `bucket_song_scores` in Mongo Express → buckets have names + descriptions; each song-bucket row has an integer score 0..100.
7. Right-swipe 20 more songs of a similar mood to one existing bucket → next rebuild adds new `bucket_song_scores` rows to the existing bucket; doesn't reset existing scores.
8. Try to read an auto-bucket built for user A while signed in as user B → never returned (SEC).

**Failure modes:**

- Anthropic error (auth, 5xx, rate limit) → build fails; logs `auto_bucket_build_failed`; no buckets created; the next `maybeBuild` trigger retries.
- LLM emits malformed JSON → Zod parse fails; same handling as Anthropic error.
- LLM proposes a `newBuckets` entry whose name matches an existing bucket (case-insensitive, trim) → reuse the existing bucket; do not insert a duplicate.
- LLM proposes an assignment for a `songKey` the server doesn't have a snapshot for → drop the assignment with a structured-log warning; continue with the rest.

**Empty / first-run state:** below the 20-swipe threshold (or no positive signal yet), the build is skipped silently — no error, no failed-state buckets.

## Design

**Visual mockup:** none — backend feature.
**DS components used:** none.
**DS components required but missing:** none.
**Layout notes:** none.

## Backend

**New endpoints:** none. Output is visible via `GET /api/me/taste/profile` (feature 01).

**Changed services:**

- `apps/api/src/modules/explore/profile-builder.service.ts` — after a successful `runBuild`, fire-and-forget `bucketBuilder.maybeBuild(userId)`. The taste-profile build remains the gatekeeper; the bucket build is downstream.

**New service:**

- `apps/api/src/modules/taste/bucket-builder.service.ts` — orchestrates: read positive-signal songs → build prompt → call `AnthropicClient.complete(...)` → parse → write `buckets` + `bucket_song_scores`.

**New / changed Mongoose collections:**

- `buckets` (existing, from feature 01) — written by this feature for the first time.
- `bucket_song_scores` (existing, from feature 01) — written for the first time.

**Build pipeline (in `bucket-builder.service.ts`):**

1. Read positive-signal pool: right-swipes ∪ saved ∪ listened-completed for the user, deduped by `songKey`. Cap at N=300 (newest-first; oldest dropped — same truncation policy as taste-profile build).
2. Read existing bucket names + descriptions for the user.
3. Compose the prompt — see "Prompt shape" below.
4. Call `anthropic.complete({ system, userMessage, model: "claude-sonnet-4-6", maxTokens: 4096 })` with prompt caching on the system message.
5. Parse against `BucketBuilderLLMOutput` Zod schema; on parse failure, log and abort (no partial writes).
6. **Upsert pass:**
   - For each `newBuckets` entry, normalize name (trim, single-space, case-folded for matching). If a bucket with the same normalized name exists, reuse its `id`; else insert a new `buckets` row with `kind: "auto"`, `state: "ready"`, fresh `id`.
   - For each `assignments` row, look up the bucket by name (after the upsert pass it's guaranteed to exist), then upsert `bucket_song_scores(userId, bucketId, songKey)`. **If the row already exists, do not overwrite its `score`** — only `lastUpdatedAt` updates.
7. Log `auto_bucket_build_completed` with counts (`newBuckets: N`, `assignments: M`).

**Prompt shape (system + user messages):**

System prompt (cached): instructions on the JSON schema + naming conventions (sentence-case, ≤ 60 chars per name, ≤ 200 chars per description) + soft-cap guidance ("reuse existing buckets when possible; total buckets per user should stay ≤ ~30"). **No per-user data.**

User message (not cached): JSON-encoded `{ recentSongs: [{ songKey, title, artist, kind }], existingBuckets: [{ name, description }] }`. **No `userId`, no `email`, no IP, no session token, no swipe `at` timestamps** (the recency is already implicit in the truncation).

**Idempotency:** running the build twice for the same user with identical inputs should produce no duplicate buckets (name normalization handles this) and no double-counted scores (initial-score-only-on-first-insert handles this).

**New env vars:** none. Reuses `ANTHROPIC_API_KEY` and the optional `ANTHROPIC_MODEL` already in `apps/api/.env.example`.

## Tooling

**New deps:** none. Reuses `@anthropic-ai/sdk` and the existing `AnthropicClient` wrapper.

**External services:** Anthropic API. Same usage profile as the existing taste-profile build.

## Privacy

The privacy posture is identical to the taste-profile build:

- User → API: nothing new.
- API → Anthropic prompt: `{ recentSongs, existingBuckets }` only. **Specifically excluded:** `userId`, `email`, IP, session cookie, swipe timestamps, listening event timestamps, any field outside the explicit list.
- API → Anthropic for prompt-cache keying: the cache key derives only from the system prompt + user-message bytes — never includes `userId`.
- Stays server-only: `buckets`, `bucket_song_scores`, the Anthropic key.

## Acceptance criteria

- [ ] With < 20 right-swipes, no build runs (no log line, no buckets created).
- [ ] With ≥ 20 right-swipes / saves / listens combined, the first build kicks off (visible log line `auto_bucket_build_started`) and `GET /api/me/taste/profile` eventually returns ≥ 1 bucket with `kind: "auto"` and `state: "ready"`.
- [ ] The same build, re-run on identical inputs, produces no duplicate buckets and does not change existing `bucket_song_scores.score` values (initial-score-only-on-first-insert).
- [ ] A simulated Anthropic 5xx (mock the client per AGENTS.md hard rule #15, quoting this spec line in the test) leaves existing buckets intact and logs `auto_bucket_build_failed`.
- [ ] No outgoing Anthropic request body contains the user's `userId`, `email`, or any timestamp (asserted via a recording fixture on the SDK's outgoing payload).
- [ ] The prompt-cache key for the bucket build is identical for two users with identical `recentSongs` + `existingBuckets`.
- [ ] LLM proposes a `newBuckets` entry that matches an existing bucket name (case-insensitive, trim) → no duplicate inserted; assignments use the existing bucket id.
- [ ] An assignment for a `songKey` not in the user's positive-signal pool is dropped (logged) and doesn't crash the build.
- [ ] Bucket A built for user X is never returned to user Y by any endpoint (extends SEC).

## Suggested invariants

The agent in `/new-invariant` will refine these — seeds, not commitments:

- **AI-XX:** The Anthropic prompt body for auto-bucket builds never contains the user's `userId`, `email`, IP, session token, or any per-event timestamp. (Recording fixture asserts absence.)
- **AI-XX:** The auto-bucket prompt-cache key depends only on the system prompt + the deterministic user-message JSON bytes — identical inputs across users derive identical cache keys.
- **AI-XX:** The user-message prompt is bounded: at most N=300 songs in `recentSongs`. Inputs above the limit are truncated newest-first.
- **DATA-XX:** Every auto-built bucket has `kind: "auto"`, `state: "ready"`, `description.length <= 200`, `name.length <= 60`.
- **LOGIC-XX:** Bucket-name de-duplication is case-insensitive after trim + single-space normalization (the LLM proposing "Late Night Drives" when "late night drives" already exists reuses the existing bucket).
- **LOGIC-XX:** A `bucket_song_scores` row inserted by this builder gets the LLM-supplied `initialScore`, clamped to `[0, 100]`. A row that already exists is **not** updated by this builder (subsequent updates come from feature 02's event scoring).
- **SEC-XX:** The bucket build reads only data belonging to the authenticated `userId` and writes only rows with the same `userId`.
- **PRIVACY-XX:** The auto-bucket build prompt's user message is a function only of `(recentSongs, existingBuckets)` derived from our DB — no fields outside that set ever appear in any prompt body.

## Implementation hint for /new-feature

**Where things live:**

- **Contracts** in `libs/shared/contracts/src/taste.ts` (extend):
  - `BucketBuilderLLMOutput = z.object({ newBuckets: z.array(z.object({ name: z.string().max(60), description: z.string().max(200) })), assignments: z.array(z.object({ songKey: z.string(), bucket: z.string().max(60), initialScore: z.number().int().min(0).max(100) })) })`
- **Pure helpers** in `libs/api/core/taste/`:
  - `bucket-prompt.ts` — `buildBucketPrompt({ recentSongs, existingBuckets }) → { system, userMessage }`. Pure: no `Date.now()`, no SDK calls. Deterministic.
  - `normalize-bucket-name.ts` — trim, single-space, lowercase.
  - Unit tests cover the prompt bounds, identity-field absence, normalization edge cases.
- **NestJS** in `apps/api/src/modules/taste/`:
  - `bucket-builder.service.ts` — the orchestrator above.
  - Inject `AnthropicClient` from the existing explore module (re-export via a shared "AnthropicClientModule" if needed to avoid a circular dep).
- **Hook** in `apps/api/src/modules/explore/profile-builder.service.ts` — at the end of `runBuild`, after the `upsertForUser` call, fire-and-forget `bucketBuilder.maybeBuild(userId)`.

**Real-upstream policy (per AGENTS.md hard rule #15):** Anthropic tests hit the real API by default. The 5xx-failure test is the one explicit mock — quote this line in the test:

> "feat-04 (taste epic) spec authorizes mocking the Anthropic client for the 5xx-failure-mode test specifically, because forcing a 5xx live is unreliable in CI."

**Suggested commit order:**

1. `spec: add AI-XX (×3), DATA-XX, LOGIC-XX (×2), SEC-XX, PRIVACY-XX invariants for auto-bucket builder`
2. `test(invariants): stub the new invariants it.todo + unit tests for buildBucketPrompt / normalize (red)`
3. `feat(contracts): add BucketBuilderLLMOutput schema`
4. `feat(api-core): add buildBucketPrompt + normalize-bucket-name helpers`
5. `feat(api): add BucketBuilderService + wire fire-and-forget hook into profile-builder`
6. tests turning `it.todo` into real assertions
