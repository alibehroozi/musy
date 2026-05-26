---
epic: explore-mix
status: done
estimated-invariants: 11
implemented-in-pr: https://github.com/alibehroozi/musy/pull/58
---

# Feature 03: Taste-driven adjacency phase

## Product description

Replace both `artist-refinement` and `personalized` candidate sourcing with one unified phase whose job is: **use the user's taste profile as a _signal_ for adjacency, not as a fence around the candidate pool**. Today, `artist-refinement` searches SoundCloud for the user's top 8 profile artists by name — the user can never see anything outside their own seeds. After this feature, a first Claude call turns the profile and a sample of high-bucket liked tracks into ~15 _adjacent_ artists, and a second Claude call picks the final 25 from the SoundCloud pool those adjacent artists generate.

Profile artists are **soft-allowed, not banned** in the related-artist output — the prompt asks Claude to lean toward adjacent artists, but the user's own seeds can occasionally appear if Claude judges them the right pick. When a profile artist's track gets right-swiped, the existing `interest_scores` → profile-builder loop lifts its score; when an adjacent artist's track gets right-swiped, that artist becomes a candidate for the _next_ profile rebuild's `artists[]` list (raising the chance Claude sees it in future related-artist generations and the user's score-axes shift toward it).

The `artist-refinement` runtime codepath retires entirely. The `phase` enum value stays in the contract (per the epic's contract-preservation rule) but is never emitted — the new merged phase emits `phase: "personalized"`.

## User behavior

1. User with `swipeCount >= 20` and a built profile opens Explore.
2. Loading state briefly (`buildingQueue: true` while the two-step rebuild runs).
3. First 25 cards render.
4. **Most cards are by artists the user has not seen in this app before** (adjacency).
5. Occasionally a card is by an artist already in their profile — soft-allowed, not banned.
6. User right-swipes "Ocean Eyes" by an adjacent-artist they didn't know → next profile rebuild (after `SWIPE_TRIGGER_THRESHOLD` more swipes or 24h) includes that artist in `artists[]` with a positive score, lifting it into the related-artist candidate set for future rebuilds.
7. User left-swipes 2+ tracks by some adjacent artist → Feature 01's soft-suppress excludes that artist from future candidate pools.
8. After the rebuild, queue feels like a DJ who learned what they like and is playing adjacent crates.

**Per-artist pagination ("paginate-by-skip"):** When SC search returns 25 results for an adjacent artist, take the top 3 _unseen_ tracks. "Unseen" means: not in any left-direction swipe (forever), not in any right-direction swipe at the current `(weekday, timeOfDay)` slot. If the top 3 SC results have all been seen, skip into positions 4, 5, 6 of the same 25-result list; continue until 3 unseen are found or the 25-result list is exhausted (in which case that artist contributes < 3 to the pool, possibly 0).

**Failure modes the user can reach:**

- Related-artists Claude call fails → fall back to the existing artist-refinement pattern (search SoundCloud directly for the top N profile artists). Graceful degradation — the user sees less adjacency but the queue still fills.
- Final-pick Claude call fails → return the deduped pool's first 25 entries (current `personalized` fallback shape preserved).
- All adjacent artists exhausted (every SC search returns only already-swiped tracks) → fall back to the existing artist-refinement pattern.
- Profile is missing or stale → the existing discovery-exit ritual (`API-19`) waits for `ProfileBuilderService.buildIfDue` before sourcing.

**Empty / first-run state:** N/A — this phase only applies after the user has progressed past `discovery`. The empty state is owned by Feature 02.

## Design

**Visual mockup:** none — backend feature. Existing Explore page visuals unchanged. Existing visual Playwright baseline is the lock.
**DS components used:** none.
**DS components required but missing:** none.
**Layout notes:** none — backend feature.

## Backend

**New endpoints:** none. Changes are internal to `apps/api/src/modules/explore/queue-builder.service.ts` (replace `sourceArtistRefinement` + `sourcePersonalized` with `sourceTasteDriven`) and its `@moc/api-core` helpers.

**New / changed Mongoose collections:** none. Reads from existing `taste_profiles`, `interest_scores`, `swipes`, `explore_queue`.

**Pure helpers to add in `libs/api/core/`:**

- `buildRelatedArtistsPrompt({ profile, highBucketSamples, shuffledSeedArtists }) → { system, user, cacheControl }` — pure, deterministic, byte-identical for equal input. System prompt: "Given this user's taste, suggest ~15 _adjacent_ artists. Lean toward artists they probably don't already listen to (cross-reference the profile artists), but if a profile artist genuinely fits, you may include them — it's a soft preference, not a ban. Spread across the user's genres but stay sound-adjacent." User message: `{ profile (projected: genres, artists, tempoBucket, remixPreference, summaryText), highBucketSamples: [{title, artist}], shuffledSeedArtists: string[] }`. The `shuffledSeedArtists` is a seeded shuffle of profile artist names (same pattern as today's `LOGIC-25` 5-artist shuffle) — gives variability across rebuilds while preserving cache compatibility for repeat runs with the same seed.
- `parseRelatedArtistsResponse(text) → { relatedArtists: string[] }` — tolerates markdown wrappers.
- `buildTasteDrivenPickPrompt({ profile, candidatePool, scoreBuckets }) → { system, user, cacheControl }` — pure, deterministic. System prompt: "Pick exactly 25 from the candidate pool, **verbatim** title+artist pairs. At most 2 per artist. The user's score buckets are provided as anti-context — `low` is for vibe-avoidance, `high` is for vibe-affinity. No invention; pool only." Similar shape to today's `buildPersonalizedPrompt` but explicitly enforces the per-artist cap in the prompt (Feature 01's `applyPerArtistCap` is the safety net).
- `parseTasteDrivenPickResponse(text) → { picks: [{title, artist}] }` — tolerates markdown wrappers.
- `paginateUnseenBySkip({ searchResults, swipeHistory, currentSlot, takeCount = 3 }) → Snapshot[]` — pure, deterministic. Iterates `searchResults` in order, applies Feature 01's `dedupHistoryAsymmetric` per item, returns the first `takeCount` items that pass the filter (or fewer if list exhausted).

**Files touched in `apps/api/`:**

- `apps/api/src/modules/explore/queue-builder.service.ts`:
  - Delete `sourceArtistRefinement()`.
  - Delete `sourcePersonalized()`.
  - Add `sourceTasteDriven()` that handles all post-discovery users.
  - Update `doRebuild()` to call `sourceTasteDriven()` whenever `phase !== "discovery"`.
- `apps/api/src/modules/explore/anthropic.client.ts` — no changes; existing client serves both new Claude calls.

**Files touched in `libs/api/core/`:**

- `apps/api/src/modules/explore/` indirectly via `@moc/api-core` — add the four new pure helpers above.
- `phaseFor()` (current location: `libs/api/core/`) — return only `"discovery"` or `"personalized"`. Never returns `"artist-refinement"` after this feature lands.
- Delete `buildArtistRefinementPrompt` + `parseArtistRefinementResponse` (no longer used).
- Delete `buildPersonalizedPrompt` + `parsePersonalizedResponse` (no longer used) — or keep them for one PR cycle as a graveyard if `/new-feature` prefers a softer deletion; default expectation is "delete in the same PR".

**Per-artist pagination (paginate-by-skip):** for each related artist, fetch up to 25 SC results (Feature 01's bump), then call `paginateUnseenBySkip` to take the first 3 unseen.

**New env vars:** none.

## Tooling

**New deps:** none.
**External services:** none new.

**Cost shape:** 2 Claude calls per `taste-driven` rebuild — confirmed acceptable in epic planning (epic Q1). Both prompts are deterministic and use Anthropic prompt caching; cache-hit cost is ~$0.001 per call on Sonnet 4.6. Worst case (full cache miss, both calls): ~$0.005–$0.01 per rebuild.

## Privacy

**New surface: high-bucket samples in the related-artist prompt.** Today, the personalized prompt sees `scoreBuckets` (`low`/`mid`/`high`) with `{title, artist}` entries (`PRIVACY-09`, no scores). This feature extends the _related-artist_ prompt with a `highBucketSamples` field — up to **10** entries (`{title, artist}` only, no scores) sampled from `interest_scores` where `score >= 8`.

| Where the data goes                | What crosses the boundary                                                                                                                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| User → API                         | unchanged — same `POST /api/explore/swipe`, `GET /api/explore/next`                                                                                                                                                                                    |
| API → third party (SoundCloud)     | per-related-artist search queries (artist name only — no user identifier, no track titles)                                                                                                                                                             |
| API → LLM prompt (related-artists) | projected profile (genres, artists, tempoBucket, remixPreference, summaryText) + up to 10 `{title, artist}` high-bucket samples + shuffled seed-artist names. **No userId, email, IP, session token, raw swipe direction history, or numeric scores.** |
| API → LLM prompt (final-pick)      | projected profile + score buckets (low/mid/high) per existing `PRIVACY-09` shape + candidate pool. **No userId, email, IP, session token.**                                                                                                            |
| Stays server-only                  | the full swipe ledger, full `interest_scores` rows (only the 10-sample is selected; the table contents themselves do not cross)                                                                                                                        |

The 10-sample cap is the privacy lever to control how much of the user's listening surface crosses to Claude. **Sampling is random within high-bucket entries; samples are not sorted by score, to avoid leaking a ranking gradient.**

## Acceptance criteria

- [ ] For a user with `swipeCount >= SWIPE_TRIGGER_THRESHOLD` (current `20`) and a non-null profile, the rebuild fires exactly **2** Claude calls (related-artists + final-pick) and **up to ~15** SoundCloud searches (one per related artist).
- [ ] `NextResponse.phase` is `"personalized"` for all post-discovery rebuilds; **`"artist-refinement"` is never emitted at runtime** (the enum value remains in the Zod contract for backward compatibility, but no code path returns it).
- [ ] Candidate pool is sourced from Claude-generated adjacent artists (not directly from profile artists). Profile artists may _appear_ in the pool only if Claude chose them in the related-artists output.
- [ ] Per-artist pagination: when an adjacent artist's top SC results are already swiped, pagination skips deeper into the 25-result list until 3 unseen are found or list is exhausted.
- [ ] Final 25 picks contain at most 2 tracks per artist (Feature 01's cap is the safety net; the prompt also instructs Claude directly).
- [ ] If the related-artists Claude call fails, the rebuild falls back to the existing pattern (search SoundCloud for top profile artists directly) — no empty queue.
- [ ] If the final-pick Claude call fails, the deduped pool's first 25 entries are returned (current `personalized` fallback shape).
- [ ] Right-swiping an adjacent-artist track raises that artist's score in `interest_scores` via the existing `LOGIC-14` mapping; next profile rebuild includes the artist with a positive score (verified by manual exercise — the existing loop, not new code).
- [ ] The `highBucketSamples` field in the related-artist prompt contains at most 10 entries, each `{title, artist}` only.
- [ ] Existing visual Playwright baseline for `/explore` does not regress.

## Suggested invariants

Seeds for `/new-invariant`:

- LOGIC-XX: `buildRelatedArtistsPrompt` is pure and deterministic; byte-identical for equal `{profile, highBucketSamples, shuffledSeedArtists}`.
- LOGIC-XX: `buildRelatedArtistsPrompt` accepts a _pre-shuffled_ `shuffledSeedArtists` (caller's responsibility — mirrors `LOGIC-25` pattern), keeping the prompt deterministic in its own surface.
- LOGIC-XX: `parseRelatedArtistsResponse` tolerates markdown wrappers and returns `{ relatedArtists: [] }` on parse failure.
- LOGIC-XX: `buildTasteDrivenPickPrompt` is pure and deterministic.
- LOGIC-XX: `parseTasteDrivenPickResponse` tolerates markdown wrappers and returns `{ picks: [] }` on parse failure.
- LOGIC-XX: `paginateUnseenBySkip` is pure and deterministic; preserves input order; returns at most `takeCount` items; uses `dedupHistoryAsymmetric` (Feature 01) for the seen-check.
- AI-XX: `buildRelatedArtistsPrompt` never contains `userId`, email, IP, session token, or numeric scores. `highBucketSamples` entries are `{title, artist}` only.
- AI-XX: `buildTasteDrivenPickPrompt` never contains `userId`, email, IP, session token, or raw swipe direction history (extends today's `AI-04` style).
- PRIVACY-XX: `highBucketSamples` passed to the related-artist prompt is capped at 10 entries and sampled randomly within high-bucket (`score >= 8`) entries; not sorted by score.
- API-XX: `taste-driven` phase never emits `phase: "artist-refinement"` at runtime; always emits `"personalized"` (or `"discovery"` if cold-start).
- API-XX: `taste-driven` phase candidate pool is sourced from Claude-generated adjacent artists; profile artists are soft-allowed but not directly searched.
- API-XX: `phaseFor` returns only `"discovery"` or `"personalized"` — `"artist-refinement"` is no longer a valid return value.

## Implementation hint for /new-feature

This file is self-contained. Feature 01 (dedup primitives) and Feature 02 (cold-start grounded) must land first. Expected layer order:

1. `spec`: append invariant rows to `INVARIANTS.md` (LOGIC-, AI-, PRIVACY-, API-).
2. `test(invariants)`: stub the new tests, confirm red.
3. `feat(api-core)`: add `buildRelatedArtistsPrompt` + `parseRelatedArtistsResponse` + unit tests (determinism, cache-stability under shuffled seeds, markdown tolerance, identity-free).
4. `feat(api-core)`: add `buildTasteDrivenPickPrompt` + `parseTasteDrivenPickResponse` + unit tests.
5. `feat(api-core)`: add `paginateUnseenBySkip` + unit tests.
6. `feat(api-core)`: update `phaseFor` to drop `"artist-refinement"` return value (with a deprecation comment if the surrounding code style allows).
7. `feat(api)`: rewrite `queue-builder.service.ts` — delete `sourceArtistRefinement`/`sourcePersonalized`, add `sourceTasteDriven` that calls the two Claude builders + SC searches + Feature 01's helpers in sequence.
8. `refactor(api-core)`: delete the old `buildArtistRefinementPrompt` / `buildPersonalizedPrompt` and their parsers.
9. Manually exercise: pick a test user with `swipeCount >= 20`, trigger a rebuild via swipe, inspect queue contents — confirm most artists are _not_ in the user's profile, count tracks per artist (≤2), right-swipe one adjacent-artist track, swipe ~20 more times to trigger profile rebuild, verify the adjacent artist now appears in the new profile's `artists[]`.

No FE work expected. The contract's `phase` enum stays as-is (all three values remain valid in the schema; only the runtime emission changes).
