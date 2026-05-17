---
epic: taste
status: done
implemented-in-pr: https://github.com/alibehroozi/musy/pull/46
estimated-invariants: 5
---

# Feature 06: Skip tracking in mix backend

## Product description

Close the feedback loop on custom mixes. When a user starts a song inside a custom-mix bucket and **skips** it (defined below), the song's `(song, source-bucket)` score in `bucket_song_scores` decrements by 15 for each `sourceBucket` the LLM said it drew the song from (recorded in `custom_mix_jobs.sourceBuckets` from feature 05).

**Skip definition:**

> A skip is a `play_started` event followed by either no `play_completed` (user navigated away) OR a `play_completed` event with `playedMs < 30,000` AND `playedMs / durationMs < 0.5` (whichever bound is reached first).

**Scope of decrement — narrow on purpose:**

- ✅ Decrement when the play context is a **custom-mix bucket** (`kind: "custom"`).
- ❌ Do **not** decrement when the play context is an auto-bucket detail page (the user might be exploring, not validating).
- ❌ Do **not** decrement when the play context is Search, Explore preview, or any non-bucket surface.

This narrowness exists because the user said: "the score for each bucket can change if it's skipped in a certain mix of buckets." The custom mix is the only "mix of buckets" in the system.

To make skip detection work, the existing play events grow two fields. The client sends them when playback originates in a bucket:

- `bucketId: string | null`
- `bucketKind: "auto" | "custom" | null`

For an auto-bucket play, the fields are still sent (so logs are informative) but the decrement only fires for `kind === "custom"`. For any non-bucket play, both fields are `null`.

The decrement reads the `custom_mix_jobs` row for that bucket to find `sourceBuckets[songKey]`, then issues one `bucket_song_scores` decrement per source-bucket id. Scores clamp at 0 (never negative). If `sourceBuckets[songKey]` is empty or the mapping is missing for that song, the decrement is a no-op (logged).

## User behavior

Manual exercise:

1. Sign in. Make sure the user has at least one custom-mix bucket (run feature 05 manually).
2. Open the bucket's detail page (feature 08, or trigger the play directly via the API in early testing).
3. Start song S. Wait 5 s. Skip to next.
4. Inspect Mongo Express → `bucket_song_scores` row for `(userId, sourceBucketX, S)` has its `score` decreased by 15 (clamped at 0). One row per `sourceBucket` mentioned in `custom_mix_jobs.sourceBuckets[S]`.
5. Start song T, listen for 31 s (or > 50 % of its duration), let it finish naturally. No decrement. (And per feature 02, a +5 context-score increment fires.)
6. Open an **auto-bucket** detail page. Start song U, skip it. No decrement. (Logs the skip, doesn't act on it.)
7. Open Search / Explore. Start song V, skip. No decrement.

**Failure modes:**

- `play_started` arrives with `bucketId` that doesn't exist or doesn't belong to the user → drop the skip-detection state for that play; log `skip_attribution_invalid_bucket`.
- `bucketKind: "custom"` but no `custom_mix_jobs` row for that bucket → log `skip_attribution_missing_job_row` and skip the decrement gracefully.
- `sourceBuckets[songKey]` is empty → no decrement; log `skip_attribution_no_source_buckets`.
- `play_completed` never arrives (user closes the tab mid-song) → after a server-side timeout (60 s past `startedAt` + `durationMs`), conservatively treat as "completed at last reported `progressMs`"; if that's < 30s AND < 50%, apply the decrement. Otherwise no-op.

**Empty / first-run state:** no custom-mix buckets yet → no skip decrements ever fire (the entire decrement path is guarded by `kind: "custom"`).

## Design

**Visual mockup:** none — backend feature.
**DS components used:** none.
**DS components required but missing:** none.
**Layout notes:** none — the client is expected to pass `bucketId` / `bucketKind` on plays that originate from bucket detail (feature 08), or `null` otherwise. The actual UI wiring is in feature 08; this feature just adds the server-side fields and the decrement logic.

## Backend

**Changed endpoints:**

- `POST /api/play/started` — body grows `bucketId?: string` and `bucketKind?: "auto" | "custom"` (both optional, default null).
- `POST /api/play/completed` — same body extension.

**Existing tracking state:** the play module already tracks active play sessions in `listening_events`. This feature adds a small in-process `Map<sessionId, { userId, bucketId, bucketKind, songKey, startedAt, durationMs }>` to detect "no completed event" cases via a TTL sweep (60 s after `durationMs` elapses).

**New / changed Mongoose collections:**

- `listening_events` (existing) — schema grows `bucketId: string | null`, `bucketKind: "auto" | "custom" | null` fields.
- `bucket_song_scores` (existing) — written by this feature for the first time with decrements.
- `custom_mix_jobs` (existing, from feature 05) — read for `sourceBuckets` mapping.

**Skip detector (in `apps/api/src/modules/play/play-events.service.ts`):**

1. On `play_started` with `bucketId` + `bucketKind`, store the in-memory entry and write the existing `listening_events` doc with the two new fields.
2. On `play_completed`, compute `playedRatio = playedMs / durationMs`. Decide skip = `playedMs < 30_000 && playedRatio < 0.5`.
3. If skip + `bucketKind === "custom"`:
   - Read `custom_mix_jobs` row for the bucket; pull `sourceBuckets[songKey]`.
   - For each `sourceBucketId`, decrement `bucket_song_scores(userId, sourceBucketId, songKey).score` by 15, clamping at 0.
4. If `play_completed` is missing for an in-memory entry after `durationMs + 60s`, apply the same logic using the last reported `progressMs` (the play module already emits progress beats).

**New env vars:** none.

## Tooling

**New deps:** none.
**External services:** none.

## Privacy

- User → API: two new optional fields (`bucketId`, `bucketKind`) on existing play events. Both are server-known data the client passes through.
- API → third party: nothing.
- API → LLM: nothing.
- Stays server-only: the skip-attribution map, `bucket_song_scores` decrements.

## Acceptance criteria

- [ ] A 5-second skip on song S from a custom-mix bucket M decrements `bucket_song_scores(userId, sourceBucketId, S).score` by 15 for **each** `sourceBucketId` in `custom_mix_jobs.sourceBuckets[S]`.
- [ ] Score never goes below 0 — repeated skips on a song with score 5 leave it at 0, not -10.
- [ ] A 5-second skip on song from an **auto-bucket** does NOT decrement anything.
- [ ] A 5-second skip from Search / Explore does NOT decrement anything.
- [ ] A completed play (≥ 30 s OR ≥ 50 % of duration) does NOT trigger a decrement. (Feature 02 handles the +5 increment for completed listens; this feature stays in its lane.)
- [ ] Missing `play_completed` event → after `durationMs + 60s`, the detector applies the same skip decision using the last `progressMs`.
- [ ] `bucketKind: "custom"` but the bucket has no `custom_mix_jobs` row → graceful log; no crash; no decrement.
- [ ] User A's skip never affects user B's `bucket_song_scores`.
- [ ] The play events' response shape and behavior for non-bucket plays is unchanged.

## Suggested invariants

The agent in `/new-invariant` will refine these — seeds, not commitments:

- **LOGIC-XX:** `isSkip({ playedMs, durationMs })` is pure: returns `true` iff `playedMs < 30_000 && playedMs / durationMs < 0.5`. (Boundary cases — `playedMs === 30_000`, `playedMs / durationMs === 0.5` — return false; tests cover both.)
- **LOGIC-XX:** Skip decrement applies iff `bucketKind === "custom"` AND a matching `custom_mix_jobs` row exists. Auto-bucket / search / explore plays never decrement.
- **DATA-XX:** Every `listening_events` document has the optional `bucketId` / `bucketKind` fields when the play originated in a bucket; both null otherwise. `(bucketId === null) === (bucketKind === null)`.
- **SEC-XX:** Skip decrements only modify `bucket_song_scores` rows whose `userId` matches the authenticated session user (extends `SEC-09`).
- **PRIVACY-XX:** The skip detector makes no HTTP calls outside our own DB and never invokes the LLM.

## Implementation hint for /new-feature

**Where things live:**

- **Pure helpers** in `libs/api/core/play/`:
  - `is-skip.ts` — `isSkip({ playedMs, durationMs })`. Pure. Unit-tested at boundaries.
- **Contracts** in `libs/shared/contracts/src/play.ts` (extend existing file, not `taste.ts`):
  - Add optional `bucketId?: z.string().uuid()` and `bucketKind?: z.enum(["auto", "custom"])` to `PlayStartedRequest` and `PlayCompletedRequest`.
- **NestJS** in `apps/api/src/modules/play/`:
  - `play-events.service.ts` — add the in-memory map + skip-detection logic.
  - `listening-events.schema.ts` — extend with the two new fields.
- **Cross-module read:** `play-events.service.ts` needs to read `custom_mix_jobs` (in the `taste` module). Inject the repository via NestJS module exports — `TasteModule` exports `CustomMixJobsRepository`; `PlayModule` imports it.
- **Cross-module write:** `play-events.service.ts` also needs to write to `bucket_song_scores`. Inject `BucketSongScoresRepository` (exported by `TasteModule` since feature 01).

**Real-upstream policy:** unchanged. This feature touches internal logic only.

**Suggested commit order:**

1. `spec: add LOGIC-XX (×2), DATA-XX, SEC-XX, PRIVACY-XX invariants for skip tracking`
2. `test(invariants): stub + unit tests for isSkip (red)`
3. `feat(contracts): add optional bucketId/bucketKind to PlayStartedRequest + PlayCompletedRequest`
4. `feat(api-core): add isSkip helper`
5. `feat(api): extend listening_events schema + skip detector in play-events.service + cross-module wiring`
6. tests turning `it.todo` into real assertions
