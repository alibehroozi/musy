---
epic: search
status: pending
estimated-invariants: 5
---

# Feature 03: Search page UI — input + results

## Product description

Bring the Search page to life: a search input pinned to the top of the page (with a search icon prefix), and a results list below. The user types, presses Enter (or the keyboard's Search/Go key on mobile), and the results from `POST /search` (feature 2) render. Each result row shows cover art (with a graceful fallback for missing art), title, artist (or station country for radio), source badge (Audius / Deezer / Radio / Genius), duration, and year. Radio stations are visually distinct from tracks (no artist line; show country and listener count instead). When the input is empty, the page shows a small "Try: Daft Punk" suggestion block (a few static example queries the user can tap to populate the input). Loading state is a skeleton that matches the result row shape. Rows are inert this feature — tapping does nothing visible (interactions land in feature 5).

## User behavior

1. User taps the Search tab → sees the search input at the top, focused or focusable, and below it the static suggestions: "Try: Daft Punk", "Try: Lo-fi beats", "Try: BBC Radio 1" (3–4 examples).
2. User taps a suggestion → the input fills with that query and a search runs immediately.
3. User taps the input and types "queen" → on Enter (or pressing the mobile keyboard Search button), suggestions disappear and a loading skeleton appears.
4. Within ~3 seconds, the skeleton is replaced by the results list — track rows and station rows interleaved according to the aggregator's ranking.
5. User scrolls through results — list scrolls naturally; bottom nav stays fixed; results don't get occluded.
6. User clears the input (or taps a clear-X if shown) → results clear, suggestions return.
7. User submits an empty query → input shake or no-op (don't fire a request); suggestions remain visible.

**Failure modes the user can reach:**

- Network failure / API down — the results area shows an inline error: "Couldn't search right now. Try again." with a retry button.
- All providers failed (200 response with `partial: true` and empty results) — show "No results found. Try a different query." Underneath, optionally indicate which providers were unreachable in small muted text (debug-friendly, harmless).
- Slow connection — the loading skeleton stays visible up to ~5 seconds, then a "still searching…" hint appears.
- Backend returns a result with missing cover art — `ResultRow` falls back to a letter-avatar (first letter of title, on `--color-surface` background).

**Empty / first-run state:** Suggestions block ("Try: Daft Punk", etc.). Same for anonymous users and for logged-in users who haven't searched yet (history list — for logged-in users — lands in feature 4 and _replaces_ the suggestions when present).

## Design

**DS components used:** Typography (h1 for the page title if any, body for results metadata, caption for source badge), `Input` (search variant, lg, with prefix icon slot), `ResultRow` (track + station variants), `Icon` (search icon for input prefix; source-badge icons if any).

**DS components required but missing:**

- **`Input`** — text input with prefix-icon slot; sizes `md`, `lg`; variants `default`, `search`. Search variant has a magnifier icon as prefix and rounded-full corners. Optional clear-X button on the right when there's text.
- **`ResultRow`** — discriminated component:
  - `variant="track"`: 56×56 cover thumbnail (with letter-avatar fallback), title (Typography body, semibold), subtitle line (artist · year · duration), trailing source badge (small pill with provider name), trailing action slot (empty in this feature; filled by save IconButton in feature 5).
  - `variant="station"`: 56×56 cover (often the station logo, with letter-avatar fallback), station name (Typography body, semibold), subtitle line (country · listener count · "Live"), source badge ("Radio"). **Visually distinct via a small "live" indicator dot or a different background tint**, so the user immediately registers it's not a static track.
  - The two variants share the trailing-action slot so feature 5's save button works on both.

**Layout notes:**

- Input is sticky at top (`position: sticky; top: 0`) with the page background underneath, so it stays visible while scrolling results. Padded for safe-area on iOS notched devices.
- Suggestions use small Button (ghost variant) chips, wrapped horizontally.
- Results list is a vertical stack with tight `gap-2` spacing.
- Loading skeleton: 5–6 row-shaped placeholders animated with the existing `--transition-normal`.

## Backend

**New endpoints:** none — uses `POST /search` from feature 2.

**New / changed Mongoose collections:** none.

**New env vars:** none.

## Tooling

**New deps:**

- None required (React, lucide-react, @moc/web-core's `fetchJson` are all available).
- Optionally `@tanstack/react-query` if we want declarative caching/loading on the client. Considered:
  - **No client cache library** (recommended for this feature) — the search results don't need cross-component caching; a `useState` + `useEffect` is plenty. Adding react-query is a significant new abstraction; defer it.
  - SWR — same trade-off as react-query.

**External services:** none new.

## Privacy

What data crosses which boundary:

- User → API: the query string (already covered by feature 2's PRIVACY-01).
- API → third party: same as feature 2.
- Browser local storage: nothing in this feature (history persistence is server-side, in feature 4).
- Stays server-only: cache contents (covered by feature 2).

## Acceptance criteria

- [ ] On `/search`, the input is visible and focusable; the suggestions block shows 3–4 example queries.
- [ ] Typing "daft punk" + Enter shows a loading skeleton within 100ms, then results within ~3 seconds (network-dependent).
- [ ] Track rows show cover, title, artist, year, duration, source badge.
- [ ] Station rows are visually distinct (no artist line; country + listener count + "Live" indicator).
- [ ] Tapping a suggestion populates the input and immediately runs a search.
- [ ] Submitting an empty query is a no-op (no request fires).
- [ ] Clearing the input (delete chars or clear-X) returns to the suggestions state.
- [ ] When the API returns `partial: true` with empty results, the UI shows "No results found".
- [ ] When the API errors (5xx or network down), the UI shows an inline retry; pressing retry refires the request.
- [ ] Bottom nav stays fixed while scrolling results; no content is occluded.
- [ ] On a 375×667 mobile viewport, the page is scrollable and the input stays sticky at the top.
- [ ] No client-side console errors during normal use.

## Suggested invariants

The agent in `/new-invariant` will refine these — they're seeds, not commitments:

- **UI-04:** When the search input is empty and there's no per-user history (anonymous, or logged-in with zero searches), the suggestions block is visible.
- **UI-05:** When a search request is in flight, a skeleton loading indicator is visible in the results area; the previous results (if any) are either preserved or replaced by the skeleton — not both.
- **UI-06:** On a successful response with non-empty results, every row in the response is rendered as a `ResultRow`; track and station variants are visually distinguishable.
- **BROWSER-02:** On a 375×667 viewport, the search input is visible at the top of the viewport without scrolling; results are scrollable; the bottom nav remains fixed and does not occlude the bottom-most result.
- **LOGIC-04** (web-core): The fetcher function for search validates the response against the `SearchResponse` Zod schema and throws on shape mismatch (covered by web-core's `fetchJson` but worth making explicit).

## Implementation hint for /new-feature

This file is self-contained. The "Product description" becomes the feature description, the "Suggested invariants" seed `/new-invariant`'s exploration, and the "Acceptance criteria" are the manual-exercise checklist before opening the PR.

**Pre-flight DS work** (each is its own `/design-system` invocation, before this feature):

1. Add `Input` DS component.
2. Add `ResultRow` DS component (track + station variants).

**Where things live:**

- `libs/web/core/search/`: `searchFetcher.ts` exposing `searchTracks(q: string): Promise<SearchResponse>` (uses `fetchJson` + the contract schema).
- `apps/web/src/features/search/`:
  - `SearchPage.tsx` (the route component, mounted at `/search`)
  - `components/SuggestionsBlock.tsx`
  - `components/ResultsList.tsx`
  - `components/ResultsSkeleton.tsx`
  - `api.ts` (re-export of the web-core fetcher; convention from existing `features/auth/api.ts`)
  - `useSearch.ts` (custom hook owning the input state, debounced or Enter-triggered request, loading/error/results state)

**Suggested commit order:**

1. `spec: add UI-04, UI-05, UI-06, BROWSER-02, LOGIC-04`
2. `test(invariants): stub the new invariants it.todo`
3. `feat(web-core): add searchFetcher`
4. `feat(web): add useSearch hook + SearchPage with suggestions, skeleton, results, error states`
5. `feat(web): add ResultsList + ResultsSkeleton + SuggestionsBlock components`
6. tests turning `it.todo` into real assertions (inline or final commit)

**Manual exercise** before opening PR: use the local app on a mobile-sized viewport and verify every acceptance criterion above. AGENTS.md says: "If you can't test the UI, say so explicitly rather than claiming success."
