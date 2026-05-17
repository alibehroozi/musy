---
epic: taste
status: done
estimated-invariants: 8
implemented-in-pr: https://github.com/alibehroozi/musy/pull/47
---

# Feature 07: Taste page and mix modal UI

## Product description

First user-visible surface of the epic. Replaces the current `apps/web/src/features/taste/TastePage.tsx` stub with a full-fidelity Taste tab:

- **Empty state** (no buckets yet): "Build your Taste" headline + "Swipe in Explore to create your buckets" subhead + "Go to Explore →" primary button + disabled "Import from Spotify" ghost button labeled "Coming soon".
- **Populated state**: header with "Taste" title + ✨ New mix button on the right; below, a 2-column grid of bucket cards (square cover + bucket name, 1-line clip).
- **Building state**: a bucket with `state: "building"` renders as a card with a shimmering cover and an italic muted "Building…" label, plus the user's prompt as a tiny caption (custom buckets only; auto-buckets just show "Building…").
- **Failed state**: a bucket with `state: "failed"` renders with a subtle danger-tinted border and tap-to-dismiss; tap shows the `errorReason`. (Out of scope: retry — the user re-requests a fresh mix.)

The ✨ New mix button opens a modal with a single `Input` ("e.g. dreamy late-night focus") + Cancel + Generate buttons. Tap Generate → POST to `/api/me/taste/custom-mix` → on 200, close the modal immediately; a new "Building…" card appears in the grid above. On 4xx / 5xx, show an inline error inside the modal (don't close).

Polling: when at least one bucket has `state: "building"`, the page polls `GET /api/me/taste/profile` every 3 s. After 30 s elapsed since the most recent build started, the cadence backs off to 8 s. After 2 min, polling stops and the bucket is rendered in `failed` state (the backend may have already transitioned it; if not, the UI takes over).

Cover for ready buckets uses the **artwork of the highest-`bucket_song_scores.score` song** in that bucket. The bucket endpoint (feature 01) already returns enough for the FE to compute this — but the FE doesn't carry score data on the bucket list, so we extend `GET /api/me/taste/profile` here to **include `coverArtworkUrl: string | null`** per bucket (server-computed). When no song has artwork, fall back to a deterministic CSS-gradient cover keyed by `bucket.id` hash.

## User behavior

Manual exercise (golden path):

1. Sign in as a brand-new user (no swipes yet) → navigate to `/taste` → empty-state mockup ([taste-empty.html](../design/taste-empty.html)) renders. Tap "Go to Explore →" → routes to `/explore`.
2. Swipe ~20 right-swipes on similar music; wait for auto-bucket build (feature 04). Navigate back to `/taste` → 2-col grid renders with the AI-named bucket(s) ([taste-populated.html](../design/taste-populated.html)).
3. Tap ✨ New mix → modal opens ([mix-modal.html](../design/mix-modal.html)). Type "rainy day jazz". Tap Generate.
4. Modal closes immediately. A "Building…" card appears at the top-left of the grid with `"rainy day jazz"` as the caption ([taste-building.html](../design/taste-building.html)).
5. After ~3–15 s, the card flips to a ready bucket with its AI-generated name + a cover.

**Failure modes:**

- Empty prompt → Generate is disabled; user can't submit.
- > 500-char prompt → Generate is disabled; helper text appears.
- 422 (no positive signal yet) → inline error in the modal: "Swipe right on some songs in Explore first so we have material to work with."
- 429 (too many in-flight) → inline error: "You already have a mix building. Wait for it to finish."
- Network failure on POST → inline error: "Couldn't reach the server. Try again."
- Building bucket never finishes (2 min timeout) → renders in `failed` state with `errorReason`.

**Empty / first-run state:** see "Empty state" above. Pixel-locked by [taste-empty.html](../design/taste-empty.html).

## Design

**Visual mockup:**

- [taste-empty.html](../design/taste-empty.html) — empty state
- [taste-populated.html](../design/taste-populated.html) — 2-col grid
- [taste-building.html](../design/taste-building.html) — one building card visible
- [mix-modal.html](../design/mix-modal.html) — modal over dimmed grid

**DS components used:** `Typography`, `Button` (primary lg, ghost lg), `Card`, `Modal`, `Input`, `BottomNav`. Existing.

**DS components required but missing:** none. The shimmer effect is inline CSS in this feature's components — not a separate DS component (per epic plan; can extract later if it spreads).

**Layout notes:** mobile-first 375×667. Grid is `grid-template-columns: 1fr 1fr` with `gap: var(--spacing-4)`. Cards are square covers (`aspect-ratio: 1 / 1`) with a 1-line clipped label below. Header is sticky; bottom nav fixed; MiniPlayer (when active) sits between content and BottomNav (existing layout pattern from other tabs).

## Backend

**Changed endpoints:**

- `GET /api/me/taste/profile` — extend the `TasteBucket` shape with `coverArtworkUrl: string | null` (server-computed from the top-scored song's `snapshot.artworkUrl`). No new endpoint; just a contract extension. Per AGENTS.md hard rule #5, update `libs/shared/contracts/src/taste.ts` first.

**New endpoints:** none.

**New / changed Mongoose collections:** none. Computation is a read-time join.

**New env vars:** none.

## Tooling

**New deps:** none. Polling is handled with a vanilla `setTimeout` recursive scheduler — no new query library introduced just for this. (The existing FE codebase doesn't use React Query / SWR yet; this feature isn't the place to introduce one.)

**External services:** none.

## Privacy

- User → API: a `promptText` string (forwarded from the user) when generating a mix.
- API → third party: nothing (the LLM call is in feature 05).
- Stays browser-only: nothing — no PII gathered FE-side.

## Acceptance criteria

- [ ] `/taste` empty state matches [taste-empty.html](../design/taste-empty.html); visual snapshot test + axe-core a11y pass (WCAG AA, per AGENTS.md hard rule #13).
- [ ] `/taste` populated state matches [taste-populated.html](../design/taste-populated.html); visual snapshot + a11y.
- [ ] `/taste` building state matches [taste-building.html](../design/taste-building.html); visual snapshot (with `prefers-reduced-motion` honored — shimmer animation pauses).
- [ ] Mix modal matches [mix-modal.html](../design/mix-modal.html); visual snapshot + a11y. Modal traps focus, `Escape` closes, scrim click closes.
- [ ] "Go to Explore →" navigates to `/explore` via React Router (not `window.location`).
- [ ] "Import from Spotify" button is rendered `disabled` and is not focusable via keyboard (or is focusable but explicitly aria-disabled — pick whichever matches the DS Button's disabled behavior; document the choice in the test).
- [ ] Tap ✨ New mix → modal opens. Generate is disabled when input is empty or > 500 chars.
- [ ] Successful POST → modal closes; a new building card appears at the start of the grid.
- [ ] Polling cadence: 3s baseline, 8s after 30s elapsed, stops at 2 min if still building.
- [ ] Buckets are rendered in **created-newest-first** order (so the new building card is at the top-left).
- [ ] No raw HTML `<button>` / `<input>` in the new files (lint rule from AGENTS.md hard rule #14 catches this).
- [ ] Building card subtitle shows the user's `promptText` for custom buckets; auto-buckets show only "Building…" with no subtitle.

## Suggested invariants

The agent in `/new-invariant` will refine these — seeds, not commitments:

- **UI-XX:** The `/taste` page renders the empty-state mockup when `GET /api/me/taste/profile` returns `{ buckets: [] }`.
- **UI-XX:** The `/taste` page renders one card per bucket; cards are ordered by `createdAt` desc.
- **UI-XX:** A bucket with `state: "building"` renders the shimmer treatment; ready and failed states use distinct visual styles.
- **UI-XX:** The mix modal's Generate button is disabled when `promptText.trim().length === 0` or `promptText.length > 500`.
- **BROWSER-XX:** Visual snapshot tests for all four states pass at 375×667; a11y check passes (contrast WCAG AA, focus visible, modal traps focus, `Escape` closes).
- **BROWSER-XX:** Polling stops when the page is unmounted; no leaked timers (the test mounts/unmounts and asserts no `setTimeout` survives).
- **LOGIC-XX:** The polling cadence is exactly `[3s × 10 ticks, 8s × (2min − 30s) / 8s ticks]`; after that, stop.
- **API-XX:** `GET /api/me/taste/profile` response includes `coverArtworkUrl` per bucket (extends feature 01's contract).

## Implementation hint for /new-feature

**Where things live:**

- **Contracts** in `libs/shared/contracts/src/taste.ts` (extend feature 01's):
  - Add `coverArtworkUrl: z.string().url().nullable()` to `TasteBucket`.
- **Pure logic** in `libs/web/core/taste/`:
  - `polling-cadence.ts` — `nextPollDelay({ elapsedMs })`: pure function returning a number of milliseconds (or `null` to stop). Unit-tested at boundaries (0 ms, 29.9 s, 30 s, 119.9 s, 120 s).
- **React feature** in `apps/web/src/features/taste/`:
  - `TastePage.tsx` — top-level page; consumes the taste-profile fetcher.
  - `BucketGrid.tsx` — 2-col grid of cards.
  - `BucketCard.tsx` — ready / building / failed variants.
  - `EmptyState.tsx` — the no-buckets layout.
  - `MixModal.tsx` — the prompt modal.
  - `useTasteProfile.ts` — fetcher + poll loop using `polling-cadence.ts`.
  - `tasteApi.ts` — `fetchTasteProfile`, `requestCustomMix` (both Zod-parse responses against the shared contracts).
- **Routing:** add `/taste/buckets/:id` placeholder in this feature (so the BucketCard tap-target has somewhere to go) — the page itself is feature 08; this feature just stubs the route + back navigation. **OR** leave the tap as a no-op in this feature and add the route in feature 08. Pick whichever produces less cross-feature churn; document the choice in the PR.

**Playwright + a11y:** add Layer 3 specs at `apps/web/playwright/taste/`:

- `taste-empty.spec.ts`
- `taste-populated.spec.ts`
- `taste-building.spec.ts`
- `mix-modal.spec.ts`
  Each spec calls `toHaveScreenshot()` against the mockup file and `expectAccessible(page)` (per AGENTS.md hard rule #13).

**Mocking the API in Playwright is universal** (per AGENTS.md hard rule #15's e2e exception). The fixture should mock `GET /api/me/taste/profile` for each state.

**Suggested commit order:**

1. `spec: add UI-XX (×4), BROWSER-XX (×2), LOGIC-XX, API-XX invariants for taste page + mix modal`
2. `test(invariants): stub the new invariants it.todo + unit tests for polling-cadence (red)`
3. `feat(contracts): add coverArtworkUrl to TasteBucket`
4. `feat(api): compute coverArtworkUrl server-side in taste.service.ts (smallest possible patch)`
5. `feat(web-core): add polling-cadence helper`
6. `feat(web): add TastePage + BucketGrid + BucketCard + EmptyState + MixModal + useTasteProfile + tasteApi`
7. `test(visual, web): add Playwright specs + baselines for the 4 states`
8. tests turning `it.todo` into real assertions
