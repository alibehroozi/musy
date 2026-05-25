---
status: planning
created: 2026-05-26
---

# Epic: explore-mix

## Vision

Make the Explore page feel like the user's DJ — every refill brings tracks they probably haven't heard, drawn from the SoundCloud catalog, but anchored to the _direction_ of their taste (not a literal repeat of the artists already in it). The taste profile becomes a _signal for adjacency_, not a fence around the candidate pool. The page UI, like/dislike gestures, swipe ledger, and Zod contracts stay frozen — only the queue-sourcing and dedup logic change.

## Why

- **User value:** Today the queue echoes the seed artists back at the user — especially in the `artist-refinement` phase, where the SoundCloud pool is literally `search(<top-8-profile-artists>)`. After this epic, the queue is a continuously fresh mix of _adjacent_ artists, with the user's own seeds occasionally surfacing (and a right-swipe on a newly-suggested adjacent artist naturally lifts that artist's score via the existing `interest_scores` → profile-builder loop).
- **Business value:** Differentiates Explore from "Spotify Discover Weekly"-style anchored playlists; lower likelihood of users churning out of Explore because "it just shows me the same artists again."

## Features (in order)

1. [01-dedup-and-diversity](./features/01-dedup-and-diversity.md) — Asymmetric dedup (left-forever, right-per-slot), soft-suppress artists with 2+ left-swipes, per-artist cap of 2 in final picks, bump SC search limit 10→25.
2. [02-discovery-grounded](./features/02-discovery-grounded.md) — Replace pure-Claude cold-start generation with Claude-generates-scenes → SC-search-each → pick. Cold-start queue is real SC catalog, not LLM-hallucinated titles.
3. [03-taste-driven-adjacency](./features/03-taste-driven-adjacency.md) — Replace `artist-refinement` + `personalized` with one two-step phase: Claude generates ~15 related artists → SC search each for top 3 unseen → Claude picks 25 from pool with per-artist cap 2. Profile artists soft-allowed but de-prioritized.

**Why this order:** Feature 1 ships dedup + diversity primitives that Features 2 and 3 both consume — and is a strict win on its own day-one. Feature 2 ships the smaller "Claude seeds → SC search → pick" pattern that Feature 3 inherits and scales up.

## Design system requirements

**Not applicable — backend-only epic.** All work is in `apps/api/`, `libs/api/core/`, and (only if a parse helper needs to be shared) `libs/shared/contracts/`. The Explore UI in `apps/web/src/features/explore/` is unchanged — same page, same card stack, same like/dislike, same `NextResponse` shape.

**Existing components used:** none changed.
**Missing components to add first:** none.

## Mockups (Phase 4)

**Intentionally skipped — backend-only epic.** No new user-visible states, no new pages, no layout changes. The mockup phase exists to catch visual/UX surprises and there are none here. `/new-feature` for each of the three features will rely on existing Playwright baselines for the Explore page (test that nothing regresses visually while the queue contents change).

## Tooling decisions

- **No new runtime deps.** Existing `@anthropic-ai/sdk` continues to serve both Claude calls per rebuild. Existing reverse-engineered SoundCloud client continues to serve `search()` (limit bump from 10 to 25 in Feature 1).
- **No new external services.** SoundCloud (already in use), Anthropic Claude (already in use).
- **Cost shape:** Feature 3's `taste-driven` rebuild fires **2 Claude calls** (related-artists + final-pick) vs the current 1 in `artist-refinement` / 1 in `personalized`. Feature 2's `discovery` rebuild also moves to 1 Claude call (was 1 — same count, different prompt). Net: roughly 2× the Claude calls per rebuild in the taste-driven phase. Both calls use Anthropic prompt caching (system prompt is byte-stable per `AI-02`/`AI-05`/`AI-09` style determinism).

## Costs

All tools open-source or within free tiers as of 2026-05-26:

- **Anthropic Claude (Sonnet 4.6):** OAuth premium tokens (`sk-ant-oat01-…`) and API keys both supported via existing `AnthropicClient`. Rate-limit fallback path (`AI-08`) unchanged. Per-rebuild cost rises from ~1 call to ~2 in `taste-driven`; aggressive prompt caching keeps the marginal cost ~$0.001–$0.005 per rebuild on cache hit.
- **SoundCloud:** unauthenticated reverse-engineered client-id flow (same as today), no rate-limit concerns at the per-rebuild query volume (~15 searches per `taste-driven` rebuild, ~8 per `discovery` rebuild).

**No paid commitment without separate approval.**

## Constraints / out of scope

- **Frozen — do not touch in this epic:**
  - The Zod contracts in `libs/shared/contracts/src/explore.ts` and `search.ts` (request/response shapes, `phase` enum values, `SongSnapshot` shape).
  - The Mongoose schemas for `taste_profiles`, `interest_scores`, `swipes`, `explore_queue`.
  - The Explore page UI in `apps/web/src/features/explore/` (page layout, card stack, like/dislike row, onboarding overlay).
  - The swipe-ledger write path (`POST /api/explore/swipe`) and its triggers (`ProfileBuilderService.maybeBuild`, `QueueBuilderService.maybeRefill`, `ScoringService.recordSwipe`).
- **Out of scope (separate future work):**
  - Other music providers beyond SoundCloud (Deezer / Audius / Genius beyond their current cover-resolution role).
  - Playlist generation / saving / sharing.
  - Custom buckets ("a mix of Selena Gomez and Taylor Swift") — the SC search-limit bump to 25 in Feature 1 is forward-compatible with this future work, but the custom-bucket feature itself lives in the `taste` epic.
  - Search.
- **`phase` enum compatibility (contract preservation):** The contract enum keeps all three values `"discovery" | "artist-refinement" | "personalized"`. After Feature 3 lands, the runtime never emits `"artist-refinement"` — the value is reserved/dead-letter so any FE branching that still references it keeps compiling.
