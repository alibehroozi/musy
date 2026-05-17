---
epic: taste
status: pending
estimated-invariants: 3
---

# Feature 03: Explore queue context eligibility backend

## Product description

Relax the Explore queue's swipe-based exclusion so the contextual scoring system from feature 02 actually has songs to re-act on. Currently, [`queue-builder.service.ts:137`](../../../apps/api/src/modules/explore/queue-builder.service.ts) computes `seenHashes = new Set(swipes.map(s => s.snapshotHash))` and excludes any song that has been swiped **at all**, forever. After this feature:

> A song is eligible for Explore at the current moment iff there is **no prior swipe** of that song at the current `(weekday, time-of-day)` slot.

- Time-of-day buckets reuse the four named slots from feature 02 (`morning / afternoon / evening / night`).
- 7 weekdays × 4 slots = **28 possible context slots** per song. Once all 28 have at least one swipe, the song is permanently out of Explore.
- Both swipe directions count toward the slot's "burnt" status — a right-swipe at Tue-evening also blocks Tue-evening from re-showing the song (the user already judged it in that context), but the song can still come back on Wed-morning, Sat-afternoon, etc.
- **Month is NOT an eligibility axis.** It would block a song for ~a month per swipe — too coarse for re-discovery. Month affects scoring (feature 02) but never eligibility.

When a song does come back in a new context:

- A **re-encountered right-swipe** in the new context: same +10 deltas per feature 02 — the song's `bucket_song_scores` go up for each bucket it's in; the time-context axes for the new `(weekday, timeOfDay, month)` go up. The auto-bucket builder (feature 04) may add it to additional buckets on its next run.
- A **re-encountered left-swipe** in the new context: zeros the three time-context axes for the new context, per feature 02.

This feature also **replaces** the existing Explore-epic invariant that asserted "swiped songs are never re-shown". The replacement is invariant `EXPLORE-LOGIC-XX: Explore eligibility is keyed by (weekday, time-of-day); a song is eligible iff none of its swipes match the current slot." Per AGENTS.md hard rule #6, removing an invariant requires explicit human approval — this epic-plan PR is that approval.

## User behavior

Backend-only. Observable side effect: a song you've left-swiped on a Tuesday evening can show up again on a Wednesday morning (or any other of the 27 slots that haven't been swiped yet).

Manual exercise:

1. Sign in.
2. Force the current time to Tuesday 19:30 (or just run at that time). Right-swipe song X. Verify song X is no longer in `GET /api/explore/next`'s results (the Tuesday-evening slot is now burnt for X).
3. Force the current time to Wednesday 11:00 (test fixture clock). `GET /api/explore/next` may now include song X (no swipe yet at Wed-morning).
4. Right-swipe song X at Wed-morning. Wed-morning is now burnt; the song's `bucket_song_scores` increment for every bucket it's in.
5. Burn all 28 slots over time. Song X never reappears.

**Failure modes:**

- A swipe doc has a missing or malformed `at` timestamp → the loader defensively treats the swipe as "all-slots-burnt" (i.e., the song is still excluded) to avoid spamming the user with an unparseable history. Logs a one-line `swipe_timestamp_parse_failed`.
- Server clock drift / TZ confusion → all weekday / time-of-day computations use the server's UTC clock for now; document this and add a follow-up note for per-user TZ support if needed later.

**Empty / first-run state:** no swipes for the user → all songs are eligible (the eligibility filter is a no-op).

## Design

**Visual mockup:** none — backend feature.
**DS components used:** none.
**DS components required but missing:** none.
**Layout notes:** none.

## Backend

**New endpoints:** none.

**Changed endpoints:**

- `GET /api/explore/next` — internals change; response shape unchanged.

**Changed files:**

- `apps/api/src/modules/explore/queue-builder.service.ts` — replace the `seenHashes` set logic with a contextual eligibility check.
- `apps/api/src/modules/explore/explore.repository.ts` (or wherever `SwipesRepository.findSwipesForUser` lives) — add an indexed read that pre-filters by `(weekday, timeOfDay)` slot if practical; otherwise fetch all swipes (current behavior) and filter in-memory using the helpers from feature 02.
- Reuse `bucketWeekday` / `bucketTimeOfDay` from `libs/api/core/taste/` (feature 02).

**Pure helper in `libs/api/core/explore/`:**

- `isEligibleAtSlot(snapshotHash, swipeHistory: Array<{snapshotHash, at}>, currentSlot: { weekday, timeOfDay }) → boolean` — returns `false` iff any swipe of that snapshot lands in the current slot.

**New / changed Mongoose collections:** none. Reads from existing `swipes`.

**New env vars:** none.

## Tooling

**New deps:** none.
**External services:** none.

## Privacy

- No new data flow. Reads from existing `swipes` collection.
- API → LLM: unchanged (the Explore queue still calls the LLM for personalized rerank; nothing new in this feature).

## Acceptance criteria

- [ ] A song right-swiped at Tue-evening is **excluded** from `GET /api/explore/next` results when the call lands at any Tue-evening time.
- [ ] The same song is **eligible** at Wed-morning (or any other un-swiped slot).
- [ ] After 28 distinct `(weekday, timeOfDay)` swipes of the same song, the song is permanently excluded.
- [ ] An invariant test that previously asserted "no swiped song re-appears" is replaced with the contextual eligibility invariant (and the old invariant is removed from `INVARIANTS.md` per AGENTS.md hard rule #6's explicit-approval clause).
- [ ] User A's swipe history never affects user B's eligibility filter.
- [ ] A malformed swipe timestamp doesn't crash the queue build; the song stays excluded and a structured log line fires.

## Suggested invariants

The agent in `/new-invariant` will refine these — seeds, not commitments:

- **LOGIC-XX:** `isEligibleAtSlot` is pure and deterministic; `true` iff no input swipe shares the current `(weekday, timeOfDay)` slot; total over all inputs (an empty `swipeHistory` returns `true`).
- **EXPLORE-LOGIC-XX (replaces an existing Explore-epic invariant):** `GET /api/explore/next` excludes a song iff at least one of the user's swipes for that snapshot lands in the current `(weekday, timeOfDay)` slot. Tested with a fixture that walks a song through all 28 slots and asserts permanent exclusion only after the 28th swipe.
- **SEC-XX:** The eligibility filter scopes all swipe reads by the authenticated `userId` (the existing `SEC-09` invariant covers the swipe write; this restates the read side for clarity).

## Implementation hint for /new-feature

This is a **`/change-feature`-shaped** change to an existing behavior, not a new feature. Use the corresponding posture:

1. Audit the Explore-epic invariants in `INVARIANTS.md` (search for "swiped" / "seen" / "excluded"). Identify the one that says "swiped songs never re-appear" or equivalent.
2. Write the spec commit that **replaces** that invariant with the contextual version, leaving the rest of the Explore queue invariants untouched.
3. Stub the new invariant tests red.
4. Pure helper first in `libs/api/core/explore/eligibility.ts`, then wire into `queue-builder.service.ts`.

**Where things live:**

- `libs/api/core/explore/eligibility.ts` — `isEligibleAtSlot`. Pure. Reuses `bucketWeekday` / `bucketTimeOfDay` from `libs/api/core/taste/`.
- `apps/api/src/modules/explore/queue-builder.service.ts` — replace the `seenHashes` set with a per-candidate `isEligibleAtSlot` call. Pass the current `Date` via `new Date()` at the start of the build (or accept an injected `clock` if a test fixture is needed).
- All three call sites that compute `seenHashes` today (`buildQueueItems`, `rebuildQueue`, `maybeRefill`) need the same update.

**Real-upstream policy:** unchanged — this feature touches in-memory filter logic; tests run against an in-memory `swipes` fixture.

**Suggested commit order:**

1. `spec: replace EXPLORE-LOGIC-XX exclusion rule with contextual eligibility; add LOGIC-XX for isEligibleAtSlot`
2. `test(invariants): stub the new invariants it.todo + unit tests for isEligibleAtSlot (red)`
3. `feat(api-core): add isEligibleAtSlot helper (helpers green)`
4. `change(api): swap seenHashes set for contextual eligibility in queue-builder`
5. tests turning `it.todo` into real assertions
