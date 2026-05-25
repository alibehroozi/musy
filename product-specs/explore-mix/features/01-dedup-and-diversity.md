---
epic: explore-mix
status: pending
estimated-invariants: 6
---

# Feature 01: Dedup and diversity foundation

## Product description

Improve the Explore queue's freshness and variety as a drop-in upgrade to the existing phases (before the bigger sourcing reworks in Features 02 and 03). Four changes ship together because they share the same insight — "the user's signals tell us what they want _less_ of, and we should respect that more aggressively":

1. **Asymmetric dedup.** Today, a swipe burns the song at the current `(weekday, timeOfDay)` slot only — same song can resurface in a different slot. This is fine for right-swipes (the user liked it; surfacing it in a different mood is reasonable) but wrong for left-swipes (the user actively rejected it). After this feature, **left-swipes filter forever** and **right-swipes still filter per-slot**.
2. **Soft-suppress disliked artists.** If a user has left-swiped 2 or more tracks by the same artist _anywhere in their history_, that artist is excluded from the candidate pool for future rebuilds. One left-swipe is noise; two or more is a vote.
3. **Per-artist cap of 2 in the final 25 picks.** Stops SoundCloud's deep catalog from steamrolling the queue with one artist when search returns many tracks for them.
4. **SoundCloud search limit 10 → 25.** Forward-compatible for the per-artist pagination Feature 03 needs ("take top 3 unseen, skip seen") and for the custom-bucket feature in the `taste` epic.

This feature is a foundation: Features 02 and 03 build on these dedup, soft-suppress, and per-artist-cap primitives.

## User behavior

1. User left-swipes "Bad Song" by Foo.
2. User comes back the next day, different time slot.
3. Queue refills.
4. **"Bad Song" never appears again** (today it would re-surface in a different `timeOfDay` slot).
5. User left-swipes a 2nd and 3rd Skrillex track over a week.
6. Queue refills.
7. **No Skrillex tracks appear in the candidate pool** (soft-suppression).
8. User opens Explore mid-week.
9. The 25-track queue contains **at most 2 tracks by any single artist** (today it can contain 5+ if one of the user's seed artists has deep catalog on SoundCloud).

**Failure modes the user can reach:**

- All candidates filtered out (heavy left-swiper hits the empty-pool edge case) → existing fallback path returns whatever's left in the pool before filtering; `buildingQueue: true` lets the FE poll while the next rebuild runs.
- A favorite artist gets soft-suppressed after a mood-driven left-swipe spree → user can right-swipe the artist again to lift the score; the soft-suppress is computed live from the swipe history, so the next right-swipe doesn't reset it but does mean any future right-swipes will let the artist re-enter the pool only after a profile rebuild (their score moves up via `interest_scores`, not via swipe count alone). (Surfaced as a known trade-off — accepted because hard-suppression of a user's _own_ tracks is the explicit user complaint that started this epic.)
- SC returns fewer than expected results for a query → pool gets smaller, no functional break.

**Empty / first-run state:** N/A for the dedup/suppress changes — a brand-new user has no swipes, so left-forever and disliked-artist suppression are no-ops. Per-artist cap and SC limit-25 bump apply from the first rebuild.

## Design

**Visual mockup:** none — backend feature.
**DS components used:** none.
**DS components required but missing:** none.
**Layout notes:** none — backend feature.

## Backend

**New endpoints:** none. All changes are internal to `apps/api/src/modules/explore/queue-builder.service.ts` and its `@moc/api-core` helpers.

**New / changed Mongoose collections:** none. Uses existing `swipes` collection (already has `direction`, `snapshot`, `weekday`, `timeOfDay` fields) and existing `explore_queue` collection.

**Pure helpers to add in `libs/api/core/`:**

- `dedupHistoryAsymmetric({ snapshotHash, swipeHistory, currentSlot }) → boolean` — returns true if the snapshot is eligible. Extends the current `isEligibleAtSlot` (`LOGIC-33`) with: any swipe in history with `direction === "left"` and matching snapshotHash → ineligible **regardless of slot**.
- `softSuppressedArtists({ swipeHistory, threshold = 2 }) → Set<string>` — pure, returns the set of artist names with `>= threshold` left-swipes in history (case-insensitive match on artist string).
- `applyPerArtistCap(snapshots, cap = 2) → Snapshot[]` — pure, deterministic, preserves input order, drops snapshots that would exceed the cap for their artist.

**Files touched in `apps/api/`:**

- `apps/api/src/modules/explore/queue-builder.service.ts` — call the new helpers in `getNext()` (eligibility filter) and at the end of each phase's candidate-pool construction (soft-suppress + per-artist cap).
- `apps/api/src/modules/search/providers/soundcloud.client.ts` — change `limit=10` to `limit=25` in the API v2 search URL.

**New env vars:** none.

## Tooling

**New deps:** none.
**External services:** none new.

## Privacy

No new data crosses any boundary. All new logic operates on swipe history that's already in Mongo. No new LLM prompts. No new third-party calls.

- User → API: unchanged (`POST /api/explore/swipe`, `GET /api/explore/next`).
- API → third party: SoundCloud search response size grows from 10 to 25 tracks per query — no new query types.
- API → LLM prompt: unchanged.
- Stays server-only: the full `swipes` collection scan for soft-suppress is server-only (already today's pattern).

## Acceptance criteria

- [ ] Left-swiping a track makes it never reappear in the user's queue regardless of which `(weekday, timeOfDay)` slot they visit Explore at.
- [ ] Right-swiped tracks still resurface in different `(weekday, timeOfDay)` slots (current `API-25` behavior preserved).
- [ ] After 2+ left-swipes on tracks by an artist, no further candidate pools for that user include that artist (case-insensitive match on artist string).
- [ ] The 25-track queue returned by `GET /api/explore/next?count=25` contains at most 2 tracks per artist for any artist.
- [ ] SoundCloud client returns up to 25 results per search query (was 10).
- [ ] Existing visual Playwright baseline for `/explore` does not regress.

## Suggested invariants

Seeds for `/new-invariant` to refine:

- LOGIC-XX: `dedupHistoryAsymmetric` is pure and deterministic; left-direction history forever-excludes, right-direction history slot-excludes only.
- LOGIC-XX: `softSuppressedArtists` is pure and deterministic; returns artist names case-insensitively normalized; threshold is parameterized but defaults to 2.
- LOGIC-XX: `applyPerArtistCap` is pure and deterministic; preserves input order; the first N snapshots per artist survive, subsequent ones are dropped.
- API-XX: explore_queue candidate pool excludes snapshots matching any left-direction swipe in user history (forever exclusion).
- API-XX: explore_queue candidate pool excludes any track whose artist (case-insensitive) is in the user's soft-suppressed set.
- API-XX: `GET /api/explore/next` response contains at most 2 items per artist (case-insensitive).
- DATA-XX: SoundCloud client `search()` returns up to 25 normalized track results per query (was 10).

## Implementation hint for /new-feature

This file is self-contained. `/new-feature` can be invoked with this path; the "Product description" becomes the feature description, the "Suggested invariants" seed `/new-invariant`'s exploration, and the "Acceptance criteria" are the manual-exercise checklist before opening the PR.

Order of layers expected by `/new-feature`:

1. `spec`: append invariant rows to `INVARIANTS.md` (DATA-, LOGIC-, API- categories).
2. `test(invariants)`: stub the new tests `it.todo`, confirm red.
3. `feat(api-core)`: add `dedupHistoryAsymmetric`, `softSuppressedArtists`, `applyPerArtistCap` + unit tests.
4. `feat(api)`: SC client limit bump 10→25 + unit test.
5. `feat(api)`: wire the three new helpers into `queue-builder.service.ts` (filter pipelines for eligibility + pool construction).
6. Verify all three existing phases (`discovery`, `artist-refinement`, `personalized`) still produce valid queues with the new dedup/cap applied.

No contract changes; no FE work.
