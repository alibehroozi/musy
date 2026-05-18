---
status: done
created: 2026-05-17
---

# Epic: Taste

## Vision

The user-value heart of moc: a "Taste" tab where the user's own listening signal — right-swipes, saves, listened-to-completion songs — is organized by AI into named **buckets** (like Spotify playlists, but generated and named by Claude from the user's behavior). Songs belong to multiple buckets with per-bucket scores. Every play / swipe / save also writes contextual scores across four axes — **weekday, time-of-day, month, and bucket** — so the same song can be "Tuesday-evening you" or "Sunday-morning you" with different strength. On demand, the user types a free-text prompt ("rainy day jazz", "hyperpop workout") and an LLM builds a custom-mix bucket on the fly. Skipping a song inside a custom mix decrements its score in its source bucket(s), closing the feedback loop. The Explore queue (built last epic) is relaxed so a song swiped in one context can come back in another, letting the contextual scoring system breathe.

## Why

- **User value:** Different playlists for different moods, generated automatically from the user's own taste — not picked by a curator. The custom-mix prompt unlocks "the music app that gets exactly what I'm in the mood for right now" — a class of experience streaming services don't natively offer.
- **Business value:** This is the surface where the swipe loop finally pays off. The taste profile built in the Explore epic becomes visible, navigable, and playable — moving moc from "AI categorizes you" to "AI gives you music shaped by you." Engagement compounds because each play / skip refines future mixes; the per-user data moat from Explore turns into a retention loop.

## Features (in order)

1. [01-taste-data-model-backend](./features/01-taste-data-model-backend.md) — new `taste` module skeleton + contracts + `buckets` and `bucket_song_scores` collections + `GET /api/me/taste/profile` endpoint (returns empty buckets array initially). Foundation; everything downstream pins to this shape.
2. [02-context-score-recording-backend](./features/02-context-score-recording-backend.md) — `context_scores` collection + pure scoring logic in `libs/api/core` + side-effect hooks on the existing swipe / play-completed / save event paths. Right-swipe / save / listen-completed increment; **left-swipe sets the three time-context axes to 0**. Bucket axis is touched too, but is a no-op until feature 04 starts creating buckets.
3. [03-explore-queue-context-eligibility-backend](./features/03-explore-queue-context-eligibility-backend.md) — relaxes `queue-builder.service.ts`' `seenHashes` exclusion. A swiped song is ineligible only at the **current `(weekday, time-of-day)` slot**; it can come back in any of the other 27 slots. The existing exclusion invariant from the Explore epic is replaced.
4. [04-auto-bucket-builder-backend](./features/04-auto-bucket-builder-backend.md) — `BucketBuilderService` (heart of the epic): Claude classifies right-swiped + saved + listened-completed songs into named buckets (existing or new) with **initial per-(song, bucket) scores**. Fires after the existing `profile-builder` runs. Buckets are never deleted.
5. [05-custom-mix-job-backend](./features/05-custom-mix-job-backend.md) — `POST /api/me/taste/custom-mix` + `custom_mix_jobs` collection. Inserts a bucket in `state: "building"` immediately, kicks off an async Claude call, then flips the bucket to `state: "ready"` (populated) or `"failed"`. Frontend polls via `GET /api/me/taste/profile`. Records each song's source-buckets for skip-attribution in feature 06.
6. [06-skip-tracking-in-mix-backend](./features/06-skip-tracking-in-mix-backend.md) — extends `play_started` / `play_completed` with `bucketId` + `bucketKind`; detects skips (< 30 s OR < 50 %); decrements `(song, source-bucket)` scores **only** when the playback context is a custom-mix bucket. Closes the feedback loop.
7. [07-taste-page-and-mix-modal-ui](./features/07-taste-page-and-mix-modal-ui.md) — `/taste` page with empty / populated / building states; 2-col bucket grid; ✨ New mix button + modal; polling for building → ready transition. First user-visible surface of the epic.
8. [08-bucket-detail-ui](./features/08-bucket-detail-ui.md) — `/taste/buckets/:id` page: large cover (highest-bucket-score song's art) + name + "N songs" + **Play all** + song list (existing `ResultRow`). Tap a row plays through `PlayerProvider`; Play all enqueues the whole bucket in score-desc order.

## Design system requirements

**Existing components used:** `Typography`, `Button`, `Card`, `IconButton`, `Modal`, `Input`, `ResultRow`, `MiniPlayer`, `BottomNav`.

**Missing components to add first:** none. The "building…" shimmer treatment is small enough to inline in feature 07. If shimmer reuse spreads later, extract a `Skeleton` component then.

## Tooling decisions

- **LLM provider:** **Anthropic Claude Sonnet 4.6** via `@anthropic-ai/sdk` — already wired by the Explore epic's `anthropic.client.ts`. Two new prompts in this epic:
  - **Auto-bucket classifier (feature 04)** — input: user's recent right-swipes / saves / listens + existing bucket names. Output: `{ newBuckets: [{name, description}], assignments: [{songKey, bucket, initialScore: 0..100}] }`.
  - **Custom-mix builder (feature 05)** — input: user's free-text prompt + a compact pool of touched songs with general scores + the user's current bucket names. Output: `{ name, description, songKeys, sourceBuckets: {songKey → [bucketId]} }`.
    Considered: OpenAI / Gemini (we're already on Anthropic; switching for one epic adds risk and learning curve), local embeddings + clustering (no LLM, but loses naming + nuance; would need a clustering library, a model file, and naming heuristics — far more code).
- **Async job machinery:** **No new infra.** Custom-mix uses the same fire-and-forget + in-flight `Map` pattern already in `profile-builder.service.ts`. Polling lives client-side. Considered: BullMQ + Redis (overkill for v1; new infra surface), Mongo-as-queue with change streams (Atlas M0 doesn't allow change streams on the free tier). Both rejected.
- **No new runtime deps.** Everything reuses the design-system, contracts, and Anthropic SDK already in place.

## Costs

All tools open-source or within free tiers as of 2026-05-17:

- **Anthropic API:** paid, user-supplied key (already authorized in the Explore epic). Two extra prompt classes:
  - **Auto-bucket build:** once per profile-rebuild trigger (≤ 1× per ~20 swipes per user). Per-call cost ~$0.001 with prompt caching on the system message.
  - **Custom mix:** on-demand, user-initiated. Per-call cost ~$0.001.
  - Combined per-user/day target: **< $0.10** (typical), well under the Explore epic's existing budget.
- **MongoDB Atlas M0:** new collections — `buckets` (~200 bytes × small N), `bucket_song_scores` (~80 bytes / row, ≤ ~1 k per active user), `context_scores` (~60 bytes / row × up to ~30 k unique song-context pairs for a very active user — still well under 512 MB cluster cap), `custom_mix_jobs` (~300 bytes, tiny). Per active user: < 5 MB. Comfortably within free tier.
- **No new runtime deps; no new external services.**

**No paid commitment beyond the user-authorized Anthropic key.**

## Constraints / out of scope

- **Out of scope this epic:**
  - Sharing buckets / playlists with other users
  - Manual edits to buckets (add / remove songs, rename, delete)
  - Renaming auto-generated bucket names
  - Reordering songs inside a bucket
  - Cross-device playback-position sync
  - Editing a custom mix after it's built (the prompt is one-shot; users re-request a new mix)
  - Re-deriving the existing `taste_profiles` (genres / artists / tempo) — that's the Explore epic's concern, kept untouched and orthogonal
  - Replacing the existing `interest_scores` collection (kept alongside; bucket / context scores are different concepts)
  - Importing from Spotify (the button is rendered disabled with "Coming soon")
- **Constraints:**
  - Mobile-first — 375×667 viewport target.
  - Logged-in users only — all endpoints behind `AuthGuard`.
  - Playback uses the existing `play/resolve` and `play/reresolve` endpoints; no new audio path.
  - Buckets are **never deleted** server-side. New ones can be added; old ones persist forever.
  - No bucket count cap (LLM-side soft cap at ~30 prevents proliferation).
  - $0 infrastructure cost ceiling beyond the user-authorized Anthropic key.
  - All existing `INVARIANTS.md` rules are upheld: SEC scoping per-user, no third-party HTTP from swipes/plays, AI prompt isolation.

## Implementation hint for future agents

Each feature file under `./features/` is self-contained. Run `/new-feature product-specs/taste/features/NN-<slug>.md` to start that feature. Implement in order — features 07 and 08 (UI) read endpoint shapes set up in 01, 04, 05. Backend features 04, 05, 06 each touch the LLM or async-job pipeline; review them sequentially to keep prompt boundaries and skip-attribution clean.

Mockups in `./design/` show the visual intent for features 07 (`taste-empty.html`, `taste-populated.html`, `taste-building.html`, `mix-modal.html`) and 08 (`bucket-detail.html`). The Playwright `toHaveScreenshot` baselines added in those features lock in what was approved here. The mockup folder is deleted by the PR that flips this EPIC to `status: done`, per the `/epic-plan` playbook.
