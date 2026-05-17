---
epic: taste
status: done
estimated-invariants: 7
implemented-in-pr: https://github.com/alibehroozi/musy/pull/42
---

# Feature 02: Context score recording backend

## Product description

Wire up the **contextual scoring system** that powers the Taste epic. Every right-swipe, left-swipe, save, and listen-to-completion event now writes scores along four axes:

- **weekday** (Mon..Sun)
- **time-of-day** — 4 named slots: `morning` (06:00–12:00), `afternoon` (12:00–18:00), `evening` (18:00–24:00), `night` (00:00–06:00)
- **month** (Jan..Dec)
- **bucket** (per-bucket score; rows live in `bucket_song_scores` from feature 01)

A new `context_scores` collection stores the weekday / time-of-day / month axes. Pure scoring logic lives in `libs/api/core/taste/`, including:

- `bucketTimeOfDay(date)` → `"morning" | "afternoon" | "evening" | "night"`
- `bucketWeekday(date)` → `"mon" | … | "sun"`
- `bucketMonth(date)` → `"jan" | … | "dec"`
- `generalScore(songContextScores, bucketScores)` → integer 0..100, used at request time to rank songs

**Increment / set deltas (the rule):**

| event                     | weekday[now]  | time[now] | month[now] | bucket (per row)                |
| ------------------------- | ------------- | --------- | ---------- | ------------------------------- |
| right-swipe               | +10           | +10       | +10        | +10 (per bucket the song is in) |
| **left-swipe**            | **= 0 (set)** | **= 0**   | **= 0**    | untouched                       |
| save                      | +15           | +15       | +15        | +15                             |
| listen-completed (≥ 50 %) | +5            | +5        | +5         | +5                              |
| skip-in-custom-mix        | 0             | 0         | 0          | −15 (handled in feature 06)     |

Increments clamp at **100**. Decrements clamp at **0** (never negative). Left-swipe is a **set** operation: even if `weekday[now]` was 87, after a left-swipe it's 0. (If the row didn't exist, it's created at 0 so the system knows the user explicitly dismissed this song in this context.) **Bucket scores are untouched by left-swipe** — the song still belongs to its buckets; it's just heavily downranked at this moment.

This feature implements writes only. **Reads** (general-score computation, top-N for bucket cover, sorted bucket-detail list) are exercised by features 04, 05, 07, 08 — the helpers are introduced here so downstream features just import them.

> **Note on the bucket axis:** the helper writes to `bucket_song_scores` for every bucket the song is in. Before feature 04 lands, no songs have any bucket membership, so the bucket-axis writes are no-ops. As feature 04 starts populating buckets, the bucket-axis writes start landing automatically without any change to this feature's code.

## User behavior

Backend-only. User-observable side effect: scoring rows accumulate as the user interacts.

Manual exercise:

1. Sign in. `context_scores` is empty for the user.
2. Right-swipe one song at, say, Tuesday 19:30 in May → inspect Mongo Express → `context_scores` has three rows: `(songKey, "weekday", "tue", 10)`, `(songKey, "timeOfDay", "evening", 10)`, `(songKey, "month", "may", 10)`.
3. Right-swipe the same song the next day at Wednesday 11:00 → `(songKey, "weekday", "wed", 10)` is new; `(songKey, "timeOfDay", "morning", 10)` is new; `(songKey, "month", "may", 20)` is incremented. The Tuesday row stays at 10.
4. Save the same song (via existing save flow) → all matching contextual rows go up by 15.
5. Left-swipe the same song at a fresh context (Sun 03:00 in June) → three rows: `(songKey, "weekday", "sun", 0)`, `(songKey, "timeOfDay", "night", 0)`, `(songKey, "month", "jun", 0)`.
6. Left-swipe at an existing high-score context (Tuesday 19:30 in May) → those three rows are **set to 0** (was previously > 0).
7. After feature 04 lands and the song is in bucket X: the next right-swipe also bumps `bucket_song_scores(userId, bucketX, songKey).score` by 10.

**Failure modes:**

- Mongo write fails → the existing event write (swipe / save / play-completed) is **not rolled back** — the user-visible operation still succeeds; the scoring write logs `context_score_write_failed` and the event remains in the source-of-truth ledger so a future re-derive could backfill if needed.
- Concurrent writes to the same `(userId, songKey, axis, value)` row → MongoDB `$inc` / `$set` atomic operators handle the race; the row converges deterministically.

**Empty / first-run state:** `context_scores` is empty for a user with no events; reads gracefully default to 0 in the `generalScore` helper.

## Design

**Visual mockup:** none — backend feature.
**DS components used:** none.
**DS components required but missing:** none.
**Layout notes:** none.

## Backend

**New endpoints:** none.

**Changed endpoints:** existing event paths gain a side-effect hook:

- `POST /api/explore/swipe` — after `recordSwipe` writes the swipe to `swipes`, fire-and-forget a context-score write (no-op for left-swipe except the three set-to-zero rows).
- `POST /api/play/started` and `POST /api/play/completed` — for `completed` events with `playedPct >= 0.5`, fire-and-forget a context-score increment.
- The interest-score upsert path (currently in the search module's `search-events.controller.ts` and from `recordSwipe` itself) — when a `saved` event lands, fire-and-forget a context-score increment.

**New / changed Mongoose collections:**

- `context_scores` (new) — fields:
  - `userId: string`
  - `songKey: string`
  - `axis: "weekday" | "timeOfDay" | "month"`
  - `value: string` — the slot label (`"tue"`, `"morning"`, `"may"`, etc.) — closed enums in the contract
  - `score: number` (integer 0..100)
  - `lastEventType: "right-swipe" | "left-swipe" | "save" | "listen-completed"`
  - `lastEventAt: Date`
  - Unique compound index `(userId, songKey, axis, value)`.
  - Compound index `(userId, songKey)` for the read-path joining all axes for one song.

- `bucket_song_scores` (existing, from feature 01) — now actually gets written to. No schema change.

**New env vars:** none.

## Tooling

**New deps:** none.
**External services:** none.

## Privacy

- User → API: unchanged. No new fields on existing requests.
- API → third party: nothing.
- API → LLM: nothing in this feature.
- Stays server-only: every `context_scores` and `bucket_song_scores` document.

## Acceptance criteria

- [ ] After a right-swipe at Tue 19:30 May, three `context_scores` rows exist: `(weekday, tue, 10)`, `(timeOfDay, evening, 10)`, `(month, may, 10)`.
- [ ] Two right-swipes of the same song in the same context produce one row each axis with `score = 20`.
- [ ] A right-swipe followed by a left-swipe at the same context produces rows with `score = 0` (not 10, not negative).
- [ ] Two left-swipes at the same context leave `score = 0` (idempotent).
- [ ] A `save` event increments contextual rows by +15.
- [ ] A `listen-completed` event with `playedPct >= 0.5` increments by +5. Below 50%, **no** context-score write happens here (feature 06 handles the < 50 % "skip" decrement for mix context specifically).
- [ ] A score never exceeds 100 (clamp on increment).
- [ ] A score never drops below 0 (clamp on decrement; not exercised in this feature — feature 06).
- [ ] If `bucket_song_scores` rows exist for a song (i.e., after feature 04 lands), bucket-axis deltas apply to each row that matches `(userId, songKey)`.
- [ ] User A's context-score writes never affect user B's rows (`(userId, …)` uniqueness preserved).

## Suggested invariants

The agent in `/new-invariant` will refine these — seeds, not commitments:

- **DATA-XX:** Every `context_scores` document has `userId`, `songKey`, `axis ∈ {weekday, timeOfDay, month}`, `value` (closed enum per axis), `score ∈ [0, 100]`. `(userId, songKey, axis, value)` is unique.
- **LOGIC-XX:** `bucketTimeOfDay(date)` is total over all `Date` values and returns exactly one of `morning | afternoon | evening | night` per the (06–12 / 12–18 / 18–24 / 00–06) ranges. Boundary instants (`12:00:00.000` etc.) are documented and tested.
- **LOGIC-XX:** A right-swipe / save / listen-completed write increments by exactly +10 / +15 / +5; clamps at 100.
- **LOGIC-XX:** A left-swipe **sets** the three time-context scores at the current `(weekday, timeOfDay, month)` to 0, regardless of prior value. Bucket-axis scores are not modified.
- **LOGIC-XX:** `generalScore(contextRows, bucketRows)` is pure and deterministic; with empty inputs returns 0; with the four axes populated returns the arithmetic mean.
- **SEC-XX:** No code path writes a `context_scores` or `bucket_song_scores` row whose `userId` differs from the authenticated request's `userId` (extends `SEC-09`).
- **PRIVACY-XX:** Context-score writes make no HTTP calls outside our own DB and never invoke the LLM.

## Implementation hint for /new-feature

**Where things live:**

- **Pure helpers** in `libs/api/core/taste/`:
  - `time-buckets.ts` — `bucketTimeOfDay`, `bucketWeekday`, `bucketMonth`
  - `score-deltas.ts` — table-driven deltas (the table from "Product description" above)
  - `general-score.ts` — `generalScore(contextRows, bucketRows): number`
  - Unit tests next to each — pure, no Mongo, no Date.now() (inject a clock or accept a `Date` arg).
- **Contracts** in `libs/shared/contracts/src/taste.ts` (extend the file from feature 01):
  - `ContextAxis = z.enum(["weekday", "timeOfDay", "month"])`
  - `WeekdayValue = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])`
  - `TimeOfDayValue = z.enum(["morning", "afternoon", "evening", "night"])`
  - `MonthValue = z.enum(["jan", … , "dec"])`
- **NestJS** in `apps/api/src/modules/taste/`:
  - `context-scores.schema.ts` + `context-scores.repository.ts`
  - `scoring.service.ts` — orchestrates: takes an event, picks the right delta row, performs the writes. Pure-ish (Mongo I/O only; all decisions delegated to pure helpers).
- **Hook the scoring service into existing controllers / services:**
  - `apps/api/src/modules/explore/explore.service.ts` → `recordSwipe` — after the existing swipe write, fire-and-forget `scoring.recordSwipe(userId, snapshot, direction)`.
  - `apps/api/src/modules/play/play-events.service.ts` → after a `play_completed` event with `playedPct >= 0.5`, fire-and-forget `scoring.recordListenCompleted(...)`.
  - `apps/api/src/modules/search/search-events.controller.ts` → when a `saved` event lands, fire-and-forget `scoring.recordSave(...)`.
- The bucket-axis write reads `bucket_song_scores` first to find which buckets the song is in, then upserts one row per bucket. Before feature 04 lands, this read returns empty and the write loop is a no-op.

No new env vars — hard rule #9 cascade not triggered.

**Real-upstream policy:** the existing swipe / play / save endpoints already follow hard rule #15 (real providers used; auth-client exception applies elsewhere). This feature's tests are all internal — no upstream interaction.

**Suggested commit order:**

1. `spec: add LOGIC-XX (×4), DATA-XX, SEC-XX, PRIVACY-XX invariants for context scoring`
2. `test(invariants): stub the new invariants it.todo + unit tests for time-buckets / score-deltas / general-score (red)`
3. `feat(contracts): add ContextAxis + WeekdayValue + TimeOfDayValue + MonthValue Zod enums`
4. `feat(api-core): add bucketTimeOfDay / bucketWeekday / bucketMonth + score-deltas table + generalScore (helpers green)`
5. `feat(api): add context_scores schema + repository + ScoringService + hook into swipe/play/save event handlers`
6. tests turning `it.todo` into real assertions
