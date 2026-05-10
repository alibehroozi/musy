---
epic: explore
status: pending
estimated-invariants: 7
---

# Feature 05: Explore queue and pre-resolution

## Product description

Per-user pre-fetched queue of swipe candidates served by `GET /api/explore/next`. Three phases drive candidate sourcing:

1. **Phase 1 — genre discovery** (entered by users with no profile, or with fewer than 3 distinct liked genres): hardcoded seed-genre list of 12 broad genres × (1 mainstream candidate + 1 niche candidate) = 24 cards. The mainstream cards reveal which genres the user even likes; the niche cards reveal whether they like the genre at depth (only people who actually like genre X tend to enjoy obscure X). Phase 1 → 2 transition: **at least 1 right-swipe in ≥ 3 distinct genres.**

2. **Phase 2 — artist refinement** (entered after Phase 1 exit, while the user has < 8 artists with strong signal in their profile): per liked genre, propose 1 common-artist track + 2 niche-artist tracks. If the common gets right-swiped, surface more niche tracks for that genre next refill (the user is open to deeper exploration). If the common gets left-swiped, de-prioritize that genre for the next refill (the genre signal was likely shallow).

3. **Phase 3 — personalized:** heuristic candidate pool (~50 — similar-artist hops + genre matches sourced from SoundCloud + Audius search) → LLM rerank. The rerank prompt also incorporates "inspired by your taste" similar-artist reasoning — the LLM uses its training-time knowledge of fandom adjacency to elevate tracks listeners-like-this-user-tend-to-enjoy. **No actual cross-user data crosses the prompt** — the "inspired by your taste" inference is generative, not collaborative-filtered.

The next 5 cards in the returned queue have already been play-resolved (URLs cached server-side via the existing `/play/resolve` resolver and stored under `play_resolutions` per `DATA-08`). Pre-resolution happens at queue-build time AND incrementally on each swipe — the explore service watches queue length and, when it dips below 5, triggers an asynchronous refill that rebuilds the queue's tail and pre-resolves the new top 5.

## User behavior

Backend feature with one user-visible consequence (after feature 6 wires the UI): the next-card transition feels instant because the audio URL is already cached.

Manual exercise:

1. Sign in.
2. `curl --cookie "$COOKIE" 'http://localhost:3001/api/explore/next?count=20'` returns 200 with `{ items: [<20 snapshots>], phase: "discovery", partial: false }` for a fresh user.
3. Mongo Express shows one `explore_queue` doc for the user with all 20 items and `play_resolutions` cached for the first 5.
4. Right-swipe ~5 times across different genres; phase eventually flips to `"artist-refinement"`; the next `?next` call returns artist-refinement-shaped candidates.
5. Force the queue down to 4 items via direct DB delete; then issue any swipe → in logs see a refill log line; the queue is back to 20 with the top 5 pre-resolved.
6. Phase 3: after enough swipes (or override the profile manually), `?next` returns rerank-shaped output; the structured log shows an Anthropic call in the build path.

**Failure modes:**

- Provider outage during candidate sourcing → fall back to whichever provider responded; if both fail, return whatever's left from the previous queue (the existing one isn't replaced). The endpoint never returns an empty `items` array if any candidate is available; only returns `{ items: [], partial: true }` if there are truly no candidates.
- Pre-resolution failure on a card → the card stays in the queue without a cached URL; the FE will lazily resolve on demand. Logged.
- Anthropic outage during phase-3 rerank → fall through to the heuristic-only top-N (skip the LLM step); log the degradation.

**Empty / first-run state:** A brand-new user gets the Phase-1 seed-genre queue. The seed list is committed code (not provider-resolved at runtime), so no provider call is needed for the very first queue.

## Design

**Visual mockup:** none — backend feature. The FE consumes the resulting list in feature 6.
**DS components used:** none.
**DS components required but missing:** none.
**Layout notes:** none.

## Backend

**New endpoints:**

- `GET /api/explore/next?count=20` (auth-required) — returns 200 with `{ items: SongSnapshot[], phase: "discovery" | "artist-refinement" | "personalized", partial: boolean }`. `count` defaults to 20, capped at 50.

**New / changed Mongoose collections:**

- `explore_queue` (new) — fields:
  - `id: string`
  - `userId: string` — **unique** (one queue per user; replaced wholesale on refill)
  - `items: SongSnapshot[]`
  - `phase: "discovery" | "artist-refinement" | "personalized"`
  - `generatedAt: Date`
  - `swipesSeenAtBuild: number` — the snapshot of `swipes` count at build time, used by phase detection

- `play_resolutions` (existing, from playback feat-01): unchanged shape; the queue feature simply drives more writes via the resolver service.
- `swipes`, `taste_profiles` (existing): reads only.

**Phase determination (pure logic in `libs/api/core/explore/queue-phase.ts`):**

- `phaseFor(profile, totalSwipeCount)`:
  - If `profile === null` OR `distinctLikedGenres(profile) < 3` → `"discovery"`.
  - Else if `profile.artists.filter(a => a.score >= STRONG_THRESHOLD).length < 8` → `"artist-refinement"`.
  - Else → `"personalized"`.

Pure, deterministic, unit-tested with fixture profiles.

**Candidate sourcing per phase:**

- **Discovery:** read from `libs/api/core/explore/seed-genres.ts` — a committed list of 12 genres × (mainstream snapshot + niche snapshot). The 24 snapshots are full `SongSnapshot` objects (no provider call needed), pre-curated. Excludes any snapshot the user has already swiped on (`swipes.snapshotHash` index lookup).
- **Artist refinement:** for each liked genre in the user's profile (top-3 ranked), call SoundCloud + Audius search for `<genre>` (or `<artist> + <genre>` if appropriate); shape per-genre output as `[1 common, 2 niche]` based on returned-result popularity heuristics (the niche-vs-common helper). Excludes already-swiped snapshots.
- **Personalized:** build a heuristic pool (~50): similar-artist queries via SoundCloud / Audius using the top-5 liked artists from the profile, plus genre fills. Pass the pool + profile summary to Anthropic in a single rerank prompt that asks the model to (a) score each candidate's appeal to the user, (b) factor in similar-artist affinity from world knowledge ("listeners who enjoy [Artist X] often also enjoy …"). The model returns a re-ordered top-N list. Take top 20.

**Rerank prompt shape:**

System prompt (cached): instructions + scoring rubric + output schema. **No user-derived content.**

User message: `{ candidatePool: [{title, artist, source}], profileSummary: string }`. **No `userId`, `email`, IP, raw swipe direction history** — same redaction posture as feature 4.

**Pre-resolution:** at queue-build / refill time, in parallel for the first 5 items, call the existing `play.service.resolve(snapshot)` (the same path the FE eventually calls). This populates `play_resolutions` per `DATA-08`. Failures are logged but don't block the queue from being saved.

**Refill trigger:** in `explore.service.ts` (extends the swipe-handler pattern from feature 3), after each swipe write check `queue.items.length`. If `< 5`, fire-and-forget `void rebuildQueue(userId).catch(logErr)`. Same posture as the profile builder.

**New env vars:** none beyond what feature 4 added.

## Tooling

**New deps:** none new (the Anthropic SDK from feature 4 is reused).

**External services:** SoundCloud (search added in feature 2), Audius (existing), Anthropic (added in feature 4).

## Privacy

- User → API: just the auth-cookie session + `count` param.
- API → SoundCloud / Audius: only genre / artist names from the user's profile (already tokens, not the user's swipes verbatim) — extends `PRIVACY-01`.
- API → Anthropic prompt: `{ candidatePool, profileSummary }`. **No `userId`, `email`, IP, raw swipe-direction history.**
- API → LLM cache key: derived from input bytes only.
- Stays server-only: the entire `explore_queue` collection.

## Acceptance criteria

- [ ] `GET /api/explore/next` returns 401 + `ErrorResponse` without a session cookie.
- [ ] A fresh user's first call returns `{ items: <20 from seed-genres>, phase: "discovery", partial: false }`.
- [ ] After at least 1 right-swipe in 3 distinct genres, the next refill returns `phase: "artist-refinement"`.
- [ ] In `artist-refinement` phase, per-genre candidates split as `[1 common-artist track, 2 niche-artist tracks]` (verifiable via test fixture profile + asserting on the structure of the returned `items`).
- [ ] In `personalized` phase, the build path calls Anthropic exactly once and the returned `items.length === count`.
- [ ] Pre-resolution: after a queue build, the first 5 `items` have a corresponding fresh `play_resolutions` doc (or one was attempted-and-logged as failed).
- [ ] Forcing `queue.items.length` below 5 (via direct DB tweak) and submitting any swipe triggers an async refill (verifiable via log line).
- [ ] No outgoing third-party request body contains a `userId`, session cookie, or raw swipe-direction history; the rerank prompt body does not contain any of those.
- [ ] An Anthropic 5xx mid-rerank causes the endpoint to fall back to heuristic top-N without 5xx-ing the user.

## Suggested invariants

The agent in `/new-invariant` will refine these — they're seeds, not commitments:

- **DATA-XX:** Every `explore_queue` doc has `userId, items, phase, generatedAt`; `userId` is unique in the collection.
- **LOGIC-XX:** `phaseFor(profile, swipeCount)` is pure and deterministic — same input → same phase, no `Date.now()`.
- **API-XX:** `GET /api/explore/next` returns 401 without a session, 200 with a `NextResponse` body otherwise; never 5xx-es when only the LLM path fails.
- **SEC-XX:** `GET /api/explore/next` for user A never returns items from user B's queue (extends `SEC-06`).
- **AI-XX:** The rerank prompt's user message contains only `(candidatePool, profileSummary)` from our DB; never a `userId`, `email`, IP, or raw swipe-direction history (extends the AI-XX invariants from feature 4).
- **AI-XX:** The rerank prompt's cache key is independent of the requesting user — two users with identical `(candidatePool, profileSummary)` inputs derive identical cache keys.
- **LOGIC-XX:** Pre-resolution always covers the first 5 items of every newly-built queue (verifiable by counting `play_resolutions` writes during build in an integration test).

## Implementation hint for /new-feature

This file is self-contained.

**Where things live (per ARCHITECTURE.md layering):**

- Contracts in `libs/shared/contracts/src/explore.ts`: extend with `NextResponse`, `Phase` literal union.
- Pure logic in `libs/api/core/explore/`:
  - `seed-genres.ts` — committed 12×2 snapshot list.
  - `queue-phase.ts` — `phaseFor(profile, swipeCount)`.
  - `rerank-prompt.ts` — `buildRerankPrompt({ candidatePool, profileSummary })`. Pure.
  - `niche-vs-common.ts` — pure helper that classifies a provider search result as niche vs. common given listen-count metadata (use thresholds, not the model).
  - All with `*.test.ts` siblings.
- NestJS module: extend `apps/api/src/modules/explore/`:
  - `explore.controller.ts` — add `GET /next`.
  - `queue-builder.service.ts` — orchestrates phase detection → candidate sourcing → optional rerank → pre-resolution → write.
  - `explore-queue.schema.ts`, `explore-queue.repository.ts`.
  - Inject the existing `PlayService` for pre-resolution.

**Real-upstream policy (per AGENTS.md hard rule #15):**

- SoundCloud / Audius / Anthropic clients are the **real** ones in tests. The single mock-allowed test is the "Anthropic 5xx mid-rerank" path; quote the override reason from this file in the test:

  > "feat-05 spec authorizes mocking the Anthropic client for the 5xx-degradation test specifically, because forcing a 5xx live is unreliable in CI."

**Suggested commit order:**

1. `spec: add DATA-XX, LOGIC-XX (×2), API-XX, SEC-XX, AI-XX (×2) invariants for explore queue`
2. `test(invariants): stub the new invariants it.todo`
3. `feat(contracts): add NextResponse, Phase`
4. `feat(api-core): add seed-genres, queue-phase, niche-vs-common, rerank-prompt + tests`
5. `feat(api): add queue-builder service + GET /next route`
6. `feat(api): wire async refill trigger into swipe handler`
7. tests turning `it.todo` into real assertions
