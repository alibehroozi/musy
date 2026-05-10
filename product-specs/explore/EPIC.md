---
status: planning
created: 2026-05-10
---

# Epic: Explore

## Vision

A "Discover" tab that lets logged-in users swipe right or left on short song previews, Tinder-style, while moc's AI builds an evolving taste profile from those signals — genres ranked, artists ranked, tempo bucket, remix preference. The same profile drives the next batch of cards: heuristically curated for the "genre discovery" first run, then artist-refinement, then a hybrid heuristic-pool + LLM-rerank loop where the LLM also infers similar-artist affinity ("inspired by your taste") from world knowledge. No cross-user data crosses prompts; "people like you also like" is generative inference, not collaborative filtering.

## Why

- **User value:** a single, low-friction surface for discovering new music tailored to taste. The preview-and-swipe loop is satisfying and learns fast — users get to "this app understands what I like" in a couple of dozen swipes rather than after weeks of ambient listening.
- **Business value:** every swipe is a binary, high-signal taste event that complements the search/listening signals captured by previous epics. The taste profile that drops out is moc's core differentiator and feeds back into the explore queue plus the future Taste tab and `/me` page. Strong engagement loop drives retention; the per-user profile is the data moat.

## Features (in order)

1. [01-card-and-icon-button-components](./features/01-card-and-icon-button-components.md) — design-system additions: `Card` (the swipe surface) and `IconButton` (circular icon-only button for pass / pause / like). Two `feat(design-system, …)` micro-commits in one PR. **Why first:** every later UI feature requires them.
2. [02-soundcloud-search-backend](./features/02-soundcloud-search-backend.md) — adds SoundCloud as a search provider in `apps/api/src/modules/search` (today SC is only used in the play resolver). Becomes the primary candidate source for the Explore queue + strengthens the existing Search tab as a side-benefit.
3. [03-swipe-ledger-backend](./features/03-swipe-ledger-backend.md) — `swipes` collection + `POST /api/explore/swipe`. Right-swipes raise `interest_scores.score` to ≥ 8; left-swipes are recorded only in the swipe ledger.
4. [04-taste-profile-backend](./features/04-taste-profile-backend.md) — `taste_profiles` collection + `GET /api/explore/profile`, periodic AI-driven build every K=20 swipes or 24h via Anthropic Claude. **First AI feature in the codebase** — establishes the AI-\* invariant section.
5. [05-explore-queue-backend](./features/05-explore-queue-backend.md) — `explore_queue` per-user candidate list + `GET /api/explore/next`, three-phase candidate sourcing (genre seeds → artist refinement → personalized hybrid), LLM rerank with similar-artist reasoning ("inspired by your taste"), top-5 cards pre-resolved for instant playback.
6. [06-explore-page-ui](./features/06-explore-page-ui.md) — frontend-only: card stack with `framer-motion` swipes, action buttons, preview integration with the existing `PlayerProvider`, onboarding overlay, refilling / empty / error states, hide-mini-player-on-explore behavior, phase pill copy varying per phase.

## Design system requirements

**Existing components used:** `Typography`, `Button`, `BottomNav`, `Icon`.

**Missing components to add first** (each via `/design-system` before the feature that needs it):

- **`Card`** — content surface for the swipe deck (album art + scrubber + title / artist + chips + optional overlay slot). **Needed for feature 6.**
- **`IconButton`** — circular icon-only button for the pass / pause / like row; variants `default | success | danger`, sizes `md` (44 px) and `lg` (56 px) so the touch-target minimum is met. **Needed for feature 6.**

Both land in feature 1 as the same PR (two `feat(design-system, …)` micro-commits).

## Tooling decisions

- **LLM provider:** **Anthropic Claude Sonnet 4.6** via `@anthropic-ai/sdk` (MIT, official SDK). Used by features 4 (profile build) and 5 (queue rerank + similar-artist reasoning). Considered: OpenAI (no preference signal from user), Google Gemini (same), raw `fetch` to Anthropic REST (loses prompt-cache helpers + typed messages). User-supplied API key, paid usage. **No free tier — explicit user authorization given to use their key.**
- **Swipe gestures:** **`framer-motion` v12** (MIT) — drag + spring + rotation primitives we'll reuse elsewhere. Considered: `react-tinder-card` (3 KB MIT but unmaintained — last release > 2 y; thin wrapper), bare pointer events from scratch (zero deps but a week of polish; spring / snap maths is annoying).
- **Embeddings / vector DB:** **NONE in v1.** Atlas M0 doesn't support Atlas Vector Search (paid feature only) and the LLM does similar-artist inference from training-time world knowledge anyway. The taste profile leaves an `embedding` field unset, reserved for v2 if real CF becomes worth the infra.
- **Genre seed list:** hand-curated `libs/api/core/explore/seed-genres.ts` — 12 broad genres × (1 mainstream + 1 niche) candidate snapshot stub each. Committed code; no external taxonomy dep.

## Costs

All tools open-source or within free tiers as of 2026-05-10:

- **Anthropic API:** paid, user-supplied key. Estimated ~1 call per 20 swipes (profile build) + ~1 call per ~20-card refill (queue rerank) → roughly 1 call per 10 swipes. With prompt caching enabled, per-call cost ~$0.001 on Sonnet 4.6. **Per-user/day cost target: < $0.05.**
- **`@anthropic-ai/sdk`** — free (MIT).
- **`framer-motion`** — free (MIT).
- **MongoDB Atlas M0:** swipe events ~200 bytes; profile docs ~3 KB; queue docs ~5 KB. Per active user: < 100 KB/day, well within 512 MB.
- **Audio:** streamed direct from SoundCloud / Audius to the browser — no R2 egress, no Cloud Run audio bandwidth.

**No paid commitment beyond the user-authorized Anthropic key.** If a real CF / vector store becomes desirable post-v1, that is a separate decision because Atlas Vector Search is paid and a third-party vector DB introduces a new infra surface.

## Constraints / out of scope

- **Out of scope this epic:**
  - Social sharing of swipes (e.g. "send to a friend")
  - Literal cross-user collaborative filtering — the LLM-inferred "inspired by your taste" reasoning is the v1 substitute
  - Playlist generation from likes
  - Full-track playback in the swipe stream (30 s previews only)
  - External-provider sync (e.g. write swipe-rights back to a connected Spotify likes list)
  - Anonymous swipe (the taste profile is per-user; logged-out users redirect to sign-in via the existing AuthGuard)
  - Offline swipe queueing (online-only in v1)
- **Constraints:**
  - Mobile-first — 375×667 viewport target.
  - Logged-in users only.
  - Providers for swipe-card audio: SoundCloud + Audius (matching the playback resolver).
  - $0 infrastructure cost ceiling beyond the user-authorized Anthropic key.

## Implementation hint for future agents

Each feature file under `./features/` is self-contained. Run `/new-feature product-specs/explore/features/NN-<slug>.md` to start that feature. Implement in order — feature 6 (UI) requires features 1–5 to be in place. Feature 1 (DS components) is best implemented as `/design-system Card` and `/design-system IconButton` in the same branch / PR.

Mockups in `./design/` show the visual intent for feature 6's four states (`01-default.html`, `02-mid-swipe-right.html`, `03-refilling.html`, `04-onboarding.html`). They are deleted by the PR that flips this EPIC to `status: done`, per the `/epic-plan` playbook.
