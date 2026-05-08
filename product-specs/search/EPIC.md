---
status: planning
created: 2026-05-07
---

# Epic: Search

## Vision

Introduce the mobile-first app shell with a Spotify-style bottom navigation (Explore, Taste, Search), and ship the **Search tab** end-to-end. Users can search the catalog by track name, artist/band, or lyrics across multiple free providers (Audius, Deezer, Radio Browser, Genius). Logged-in users get a per-user, deduped, infinite-scroll search history; tapping a row records an "explored" interest signal (score 3); a save action records "saved" (score 8). Anonymous users can search and view results, but any interaction (tap or save) opens a sign-in modal. Playback, the Explore and Taste tabs, sharing, and a saved-songs browse view are explicitly out of scope and ship in later epics.

## Why

- **User value:** lets users discover music by name, artist, or lyrics across mainstream + indie + radio sources before any subscription is required, and quietly captures the signals that will make their personal taste profile possible later.
- **Business value:** every "explored" and "saved" event becomes a row in `interest_scores` — the seed dataset for the future taste model. Without this epic, the AI-taste epics have no data to train on.

## Features (in order)

1. [01-app-shell-bottom-nav](./features/01-app-shell-bottom-nav.md) — introduce React Router and the fixed bottom navigation with Explore, Taste, and Search tabs (Explore + Taste are empty placeholders this epic).
2. [02-search-aggregator-backend](./features/02-search-aggregator-backend.md) — `POST /search` aggregates Audius, Deezer, Radio Browser, and Genius (lyric search) in parallel with a per-provider timeout, dedupes results, and caches in MongoDB with TTL.
3. [03-search-page-ui](./features/03-search-page-ui.md) — search input at the top, results list below, "Try: Daft Punk" suggestions for empty state; rows are inert in this feature (interactions land in feature 5).
4. [04-search-history](./features/04-search-history.md) — per-user search history persisted on submission with very precise dedupe, infinite-scroll list back to the user's first-ever search, tap-to-replay (cache hit if present, else re-aggregate).
5. [05-interactive-rows-gating](./features/05-interactive-rows-gating.md) — tap a row records "explored" (score 3), tap the add button records "saved" (score 8); anonymous users hit a sign-in Modal instead. `interest_scores` collection upserts with `score = max(old, new)`.

## Design system requirements

**Existing components used:** Typography (h1, h2, h3, body, caption), Button (primary, secondary, ghost; sm/md/lg).

**Missing components to add first** (each via `/design-system` before the feature that needs it):

- `lucide-react` icon library — open-source (ISC license), tree-shakeable, ~1500 icons. Needed for tab icons (feature 1), search/clock icons (feature 3), heart/plus icons (feature 5). DS adds a thin `<Icon name="..." />` wrapper so app code never imports `lucide-react` directly.
- `BottomNav` — fixed bottom bar, 3 tabs, icon + label, active-state styling. **Needed for feature 1.**
- `Input` — text input with prefix-icon slot, sizes `md` and `lg`, variants `default` and `search`. **Needed for feature 3.**
- `ResultRow` — cover thumbnail (or letter avatar if missing), title, subtitle (artist · year · duration), trailing source-badge slot, trailing action slot. Variants: `track` and `station` (radio stations are visually distinct — no artist, just station name + country + listener count). **Needed for feature 3.**
- `Modal` — bottom-sheet style (mobile-first), backdrop, close button, focus trap. **Needed for feature 5.**
- `IconButton` — small touch target with one icon, used for the add/save button on each result row. **Needed for feature 5.**

## Tooling decisions

- **Music search — tracks:**
  - **Audius** (primary) — Apache-2.0 SDK, free, no key required (key recommended for higher rate limit). Modern open API, ~6M tracks. Considered: not using it (would lose the open/decentralized angle and the future stream URLs when playback ships).
  - **Deezer Public API** (mainstream coverage) — Free, **no key required** for catalog endpoints (search, track metadata). 50 req/sec cap. Deezer TOS allows non-commercial use freely; commercial use requires partnership — **acceptable for hobby/portfolio scope**. Considered: Spotify (paid + OAuth required, defeats anonymous search), Jamendo (smaller, only CC-licensed).
- **Music search — radio:**
  - **Radio Browser** — fully open data, free, no key, ~40K live stations worldwide. No realistic alternative at this catalog size and openness.
- **Lyric search:**
  - **Genius API** — free, key required (`GENIUS_ACCESS_TOKEN`), ~1 req/sec recommended. Considered: Musixmatch (free tier capped at 2000 calls/day on developer tier — too tight), self-hosting LRCLIB + Mongo text index (needs ingestion pipeline — too much work for v1).
- **Icon library:**
  - **lucide-react** — ISC license, ~1500 icons, tree-shakeable, actively maintained. Considered: react-icons (heavier bundle, multiple icon sets), heroicons (Tailwind-aligned but smaller catalog).

## Costs

All tools open-source or within free tiers as of 2026-05-07:

- **Audius** — free, no monthly cap, per-IP rate limit.
- **Deezer Public API** — free, 50 req/sec, no monthly cap. Catalog/metadata endpoints only (no playback).
- **Radio Browser** — free, no key, polite use expected (mirrored across multiple servers).
- **Genius API** — free developer tier, ~1 req/sec recommended, no documented monthly cap.
- **lucide-react** — free, npm-installable.

**No paid commitment without separate approval.** If any provider's free tier becomes insufficient, the epic gracefully degrades: the aggregator continues with the remaining providers (it already tolerates per-provider timeouts).

## Constraints / out of scope

- **Out of scope this epic:**
  - Playback / preview audio of any kind
  - Sharing
  - Saved-songs browse UI (the save _action_ is in scope, the _view_ is not)
  - Explore and Taste tabs (placeholder pages only)
  - Auth flow (already implemented; this epic only consumes existing Google OAuth + session cookie)
  - Desktop-optimized layout (mobile-first; desktop is a future concern)
  - Taste-aware ranking of results (deferred to a later AI epic)
- **Constraints:**
  - Mobile-first PWA — every UI feature must work and feel native on a phone-sized viewport.
  - No regulatory constraints.
  - No deadline.
  - All providers must remain free / no-paid-tier.

## Implementation hint for future agents

Each feature file under `./features/` is self-contained. Run `/new-feature product-specs/search/features/NN-<slug>.md` to start that feature. Implement features strictly in order — later features depend on the data shapes, contracts, and UI scaffolding established by earlier ones.

Before features 1, 3, and 5, run `/design-system` for each missing component listed under that feature's "DS components required but missing" section.
