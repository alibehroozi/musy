---
epic: explore-mix
status: pending
estimated-invariants: 5
---

# Feature 02: Cold-start discovery grounded in SoundCloud

## Product description

Replace cold-start (`discovery` phase) candidate generation. Today, a new user with fewer than ~20 swipes hits a single Claude call that returns 30 hand-generated `{title, artist}` pairs from world knowledge — which can hallucinate titles that don't exist on SoundCloud, leading to playback failures and pool shrinkage after cover-resolution drops them. After this feature, the `discovery` phase uses a two-step pattern (one Claude call + one round of SC searches): Claude generates ~8 "scenes" (short genre+era+mood keyword phrases), each scene is fanned out to a SoundCloud search, and the deduped pool is what fills the queue. The brand-new user sees the same exploratory variety they get today, but every track is a real SoundCloud result they can actually play.

This feature also validates the "Claude generates seeds → SC search → pick" pattern in miniature — Feature 03 scales it up to ~15 related-artists.

## User behavior

1. Brand-new user finishes onboarding and lands on Explore.
2. Loading state shown briefly while `discovery` phase rebuilds (`buildingQueue: true`).
3. First 25 cards render — each from a real SC track, every card has a working cover and plays its preview correctly.
4. User starts swiping left/right.
5. As right-swipes accumulate, the soft-signal from the existing `recentSwipes` pattern (`LOGIC-28`) feeds the scene-generation prompt — Claude leans toward scenes matching the right-swiped feel and away from the left-swiped feel.
6. After ~20 swipes, the system transitions to `phase: "personalized"` (or whatever Feature 03 emits) — but that's Feature 03's territory.

**Failure modes the user can reach:**

- Claude scenes call fails → fall back to current static seed list (existing path, unchanged) so the page still loads with 24 hand-curated snapshots.
- A scene returns 0 SC results → that scene contributes nothing to the pool; remaining scenes carry it.
- All scenes return only already-swiped tracks (with Feature 01's left-forever dedup) → fall back to static seed list.

**Empty / first-run state:** This _is_ the first-run state for the user — see steps 1–3 above. The "loading shimmer + onboarding overlay" path in the existing FE is unchanged.

## Design

**Visual mockup:** none — backend feature. Existing Explore page visuals unchanged. Existing visual Playwright baseline is the lock.
**DS components used:** none.
**DS components required but missing:** none.
**Layout notes:** none — backend feature.

## Backend

**New endpoints:** none. Changes are internal to `apps/api/src/modules/explore/queue-builder.service.ts`'s `sourceDiscovery()` method and its `@moc/api-core` helpers.

**New / changed Mongoose collections:** none.

**Pure helpers to add in `libs/api/core/`:**

- `buildDiscoveryScenesPrompt({ recentSwipes }) → { system, user, cacheControl }` — pure, deterministic, byte-identical for equal input. System prompt asks for ~8 scenes; each scene is a short keyword phrase suitable for a SoundCloud search query (e.g., `"early 2000s french touch house"`, `"dreamy slow shoegaze"`, `"90s NYC underground hip-hop"`). Same identity-free guarantees as `buildColdStartPrompt` today (`AI-10`).
- `parseDiscoveryScenesResponse(text) → { scenes: string[] }` — tolerates markdown wrappers (mirror `LOGIC-20` / `LOGIC-27`).

**Modified in `libs/api/core/` (existing):**

- The current `buildColdStartPrompt` / `parseColdStartResponse` are _retained_ in the codebase only if Feature 02 keeps them as the static-seed-fallback codepath. If the fallback is changed to the hand-curated `seedSnapshots()` list directly, the old prompt can be deleted entirely — the implementation chooses. Default expectation: delete the old prompt builders to keep the surface clean.

**Files touched in `apps/api/`:**

- `apps/api/src/modules/explore/queue-builder.service.ts`'s `sourceDiscovery()` — replace `anthropic.complete(buildColdStartPrompt(...))` pipeline with: Claude scenes call → loop `soundcloud.search(scene)` (parallel) → flat-map normalized hits → dedup (Feature 01's helpers) → apply per-artist cap → resolve covers (existing `resolveCoversForCandidates`).

**New env vars:** none. Uses existing `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`.

**Pagination:** With the new SC search limit of 25 (Feature 01), each scene returns up to 25 tracks. Take all (or top N after dedup); no per-scene cap — Feature 01's per-artist cap downstream handles density.

## Tooling

**New deps:** none.
**External services:** none new — Anthropic Claude and SoundCloud, both already in use.

## Privacy

The scene-generation prompt operates under the same constraints as today's cold-start prompt (`AI-10`):

- User → API: unchanged.
- API → third party: SoundCloud queries change from per-artist names (Feature 03) / not-used (today's cold-start) to per-scene keyword phrases. Scenes contain genre/era/mood keywords only — never user identifiers.
- API → LLM prompt: contains `recentSwipes` (soft signal — same shape as today: `{title, artist, direction}` for up to `COLD_START_MAX_RECENT_SWIPES` recent swipes). **No userId, email, IP, session token, profile data, or `interest_scores` in this prompt** — cold-start by definition pre-dates a profile.
- Stays server-only: the rest of the user record.

## Acceptance criteria

- [ ] For a user with `swipeCount < SWIPE_TRIGGER_THRESHOLD` (current `20`), the `discovery` rebuild fires exactly **1** Claude call (for scenes) and **up to 8** SoundCloud searches in parallel.
- [ ] Every track in the resulting queue resolves to a real SoundCloud track ID (no hallucinated titles surviving cover-resolution).
- [ ] If the Claude scenes call fails, the queue is filled from the current static `seedSnapshots()` fallback list (no regression on outage).
- [ ] If all SC searches return empty pools, same fallback path applies.
- [ ] `NextResponse.phase` is still `"discovery"` for these users.
- [ ] Feature 01's dedup (left-forever, right-per-slot) and per-artist cap of 2 apply to the new pool.
- [ ] Existing visual Playwright baseline for `/explore` does not regress.

## Suggested invariants

Seeds for `/new-invariant`:

- LOGIC-XX: `buildDiscoveryScenesPrompt` is pure and deterministic — byte-identical output for equal input (cache-key compat).
- LOGIC-XX: `buildDiscoveryScenesPrompt({ recentSwipes: [] })` is byte-identical to the empty-soft-signal path (preserves the cache-stability pattern from `LOGIC-28`).
- LOGIC-XX: `parseDiscoveryScenesResponse` tolerates markdown wrappers and returns an empty `{ scenes: [] }` on parse failure rather than throwing.
- AI-XX: `buildDiscoveryScenesPrompt` never contains `userId`, email, IP, or session token; `recentSwipes` items are `{title, artist, direction}` only.
- API-XX: `discovery` phase candidate pool is sourced from SoundCloud searches (one per Claude-generated scene), not from LLM-generated titles. Static `seedSnapshots()` is the failure-path fallback only.

## Implementation hint for /new-feature

This file is self-contained. Expected layer order:

1. `spec`: append invariant rows to `INVARIANTS.md` (LOGIC-, AI-, API-).
2. `test(invariants)`: stub the new tests, confirm red.
3. `feat(api-core)`: add `buildDiscoveryScenesPrompt` + `parseDiscoveryScenesResponse` + unit tests (determinism, cache compat, markdown tolerance, identity-free).
4. `feat(api)`: rewrite `sourceDiscovery()` in `queue-builder.service.ts` to call the new prompt builder, fan out to SoundCloud, fall back to `seedSnapshots()` on any failure.
5. (Optional cleanup) `refactor(api-core)`: delete `buildColdStartPrompt` / `parseColdStartResponse` once `sourceDiscovery()` no longer calls them.
6. Manually exercise: clear test user's swipe history (or use a fresh account), trigger `discovery` rebuild, verify all 25 cards play preview audio successfully (no broken covers / missing previews).

No contract changes; no FE work. Feature 01 must land first so its dedup/cap helpers are available.
