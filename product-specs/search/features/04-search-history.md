---
epic: search
status: done
estimated-invariants: 6
implemented-in-pr: https://github.com/alibehroozi/musy/pull/6
---

# Feature 04: Search history (per-user, infinite scroll, deduped)

## Product description

For authenticated users, persist every submitted search query and surface them as a history list on the Search page. The list **replaces the suggestions block** when the user has at least one history entry. Tapping a history item replays that search — and if the result for that query is still in the server-side cache (feature 2's `search_cache`), the response is instant; otherwise it re-aggregates fresh. The list dedupes very precisely: submitting "queen" twice does **not** create two entries; it updates the existing entry's `lastSearchedAt` and bubbles it to the top. The list supports true infinite scroll back to the user's first-ever search (cursor pagination, no fixed cap). Anonymous users see only the static suggestions block (no history persistence at all — not even in localStorage). History entries are stored only the moment a query is submitted (Enter pressed) — not on every keystroke.

## User behavior

1. Anonymous user opens Search → sees only the static suggestions (covered in feature 3); no history is recorded; the rest of this feature is invisible to them.
2. Authenticated user with zero prior searches opens Search → still sees the static suggestions (history is empty).
3. Authenticated user submits "queen" → results appear; the query is also recorded server-side.
4. Authenticated user submits "daft punk" → results appear.
5. Authenticated user clears input → the suggestions are now _replaced_ by a history list showing "daft punk" (top) and "queen" (below), each with a small clock icon and a relative timestamp ("just now", "2 min ago").
6. Authenticated user submits "queen" again → input clears → history shows "queen" at top, "daft punk" below; the entry was deduped (still only two entries total).
7. Authenticated user taps "daft punk" in the history → input populates with "daft punk", search runs; if still cached server-side, result is near-instant.
8. Authenticated user scrolls down the history list → more entries load (cursor pagination, page size ~20); scroll continues until the user's first-ever search.
9. Authenticated user signs out → next visit (anonymous) shows only static suggestions.

**Failure modes the user can reach:**

- History fetch fails (e.g. API 500) — the history area shows a small inline retry; the suggestions remain visible underneath as a fallback.
- Pagination cursor invalid (e.g. user signed out and back in mid-scroll) — restart pagination from the top, no error shown.
- A history entry references a query whose cache has expired and whose providers are now down — the replay gets a `partial: true` response (feature 3 handles the empty-results case).

**Empty / first-run state:** Suggestions block (from feature 3) — same for anonymous and authenticated-with-zero-history.

## Design

**DS components used:** Typography (caption for relative timestamps), `Icon` (clock icon per row, search icon as prefix). No new DS components are strictly required — history rows are simple flex rows with text + icon, fine to compose ad-hoc inside the feature folder.

**DS components required but missing:** none.

**Layout notes:**

- History list visually distinct from results: lighter font, smaller row height (~48px vs ResultRow's ~72px), clock icon prefix.
- When the user starts typing, the history list is hidden (suggestions/results take over — feature 3's existing logic).
- Infinite scroll trigger: an `IntersectionObserver` on a sentinel element near the bottom of the list; when in viewport, fetch the next page.

## Backend

**New endpoints:**

- `GET /search/history?cursor=<opaque>&limit=20` (auth required) — returns `{ entries: HistoryEntry[], nextCursor: string | null }`. Sorted by `lastSearchedAt DESC`. `limit` capped at 50; default 20.

  HistoryEntry shape: `{ id: string, query: string, lastSearchedAt: string (ISO), searchCount: number }`.

- `POST /search` (feature 2) is **modified** to also write a history entry when a session is present. This is the "public-with-optional-session" pattern: the controller is `@Public()`, but the service inspects `req.user` and persists when it exists. The persistence is best-effort — if the history write fails, the search response still succeeds.

**New / changed Mongoose collections:**

- `search_history` — fields:
  - `userId: string` (User.id, references the User collection)
  - `query: string` (the normalized query; same normalization function as `search_cache.queryHash` to keep dedupe consistent)
  - `firstSearchedAt: Date`
  - `lastSearchedAt: Date`
  - `searchCount: number` (incremented on each duplicate submission)
  - Unique compound index `(userId, query)` — guarantees dedupe at the database level.
  - Index `(userId, lastSearchedAt: -1)` — drives the paginated history list.
  - **No TTL** — history persists indefinitely (per the user spec: "true infinite scroll back to user's first search").

**New env vars:** none.

## Tooling

**New deps:** none.

**External services:** none new.

## Privacy

What data crosses which boundary:

- User → API: query string (covered by feature 2). The history endpoint additionally requires the session cookie.
- API → third party: still only the query string on the original `/search` call; the history list is queried purely from our Mongo. **No third-party request includes a userId.**
- API → LLM prompt: none.
- Stays server-only: `userId` ↔ query mapping (the search history of every user). This is **per-user private data** — must not be exposed to other users.

## Acceptance criteria

- [ ] As an anonymous user, submitting searches does not create any `search_history` document (verifiable via Mongo Express or an integration test).
- [ ] As an authenticated user, submitting "queen" creates exactly one `search_history` doc with `searchCount: 1`.
- [ ] Submitting "queen" again increments `searchCount` to `2` and updates `lastSearchedAt`; still exactly one doc.
- [ ] `GET /search/history` returns the user's entries sorted by `lastSearchedAt DESC`, newest first.
- [ ] `GET /search/history` for user A never returns user B's entries (verifiable via integration test with two users).
- [ ] `GET /search/history` without a session returns 401 (per the global AuthGuard).
- [ ] Infinite scroll works: scrolling to the bottom fetches the next page; the list grows until the user's first-ever search is reached, after which `nextCursor` is `null` and no more requests fire.
- [ ] Tapping a history item populates the input and re-runs the search (cache hit if within TTL).
- [ ] When `search_history` write fails (e.g. mongo down), `POST /search` still returns 200 with results (best-effort persistence).
- [ ] On the UI: the history list replaces the suggestions block when the user has ≥ 1 entry; clearing the input shows the history list (not the suggestions).

## Suggested invariants

The agent in `/new-invariant` will refine these — they're seeds, not commitments:

- **DATA-04:** `search_history` has a unique compound index `(userId, query)` — submitting the same query twice creates exactly one document. Verified by an integration test that submits twice and asserts `count = 1`.
- **API-05:** `GET /search/history` requires a valid session (401 when missing).
- **SEC-05:** `GET /search/history` for user A never includes documents owned by user B (verified by an integration test seeding both users' histories and asserting no cross-leak).
- **PRIVACY-02:** No `search_history` content (query string or userId) ever appears in third-party requests; the aggregator (feature 2) is unaware of history.
- **API-06:** Cursor pagination on `GET /search/history` is stable: re-issuing the same cursor returns the same page (no skipped or duplicated entries when the underlying data hasn't changed).
- **UI-07:** When the user has ≥ 1 history entry and the input is empty, the history list is visible (and the static suggestions block is not).

## Implementation hint for /new-feature

This file is self-contained. The "Product description" becomes the feature description, the "Suggested invariants" seed `/new-invariant`'s exploration, and the "Acceptance criteria" are the manual-exercise checklist before opening the PR.

**Where things live:**

- Contracts in `libs/shared/contracts/src/search.ts` (extend feature 2's file): `HistoryEntry`, `HistoryResponse`.
- Pure logic in `libs/api/core/search/`: extend the existing query-normalization function so `search_cache` and `search_history` use the same canonical form (so dedupe is consistent between cache lookup and history dedupe).
- NestJS module: extend `apps/api/src/modules/search/` with:
  - `search.history.controller.ts` (or extend the existing controller): `GET /search/history` route, `OwnerGuard`-equivalent (just `req.user.uid` filtering).
  - `search.history.repository.ts` for the Mongo queries.
  - `search.history.schema.ts` for the Mongoose model.
  - Modify `search.service.ts` to fire-and-forget the history upsert when `req.user` is present on the `POST /search` path.
- Web side: extend `apps/web/src/features/search/`:
  - `components/HistoryList.tsx` with infinite-scroll behavior.
  - `useHistory.ts` hook owning fetch + pagination state.
  - Update `SearchPage` so the empty-input area chooses between history list (auth + ≥1 entry) vs suggestions block (otherwise).
- Web-core: add `historyFetcher.ts` next to `searchFetcher.ts`.

**Auth note:** the global AuthGuard already protects `GET /search/history` by default (no `@Public()` opt-out). The `POST /search` route stays `@Public()` with optional-session reading.

**Suggested commit order:**

1. `spec: add DATA-04, API-05, SEC-05, PRIVACY-02, API-06, UI-07`
2. `test(invariants): stub the new invariants it.todo`
3. `feat(contracts): add HistoryEntry, HistoryResponse`
4. `feat(api-core): extract query-normalize into a shared function (used by both cache and history)`
5. `feat(api): add search_history schema, repository, controller; modify search.service to upsert history on session-bearing POST /search`
6. `feat(web-core): add historyFetcher with cursor pagination`
7. `feat(web): add HistoryList + useHistory + wire SearchPage to switch between history and suggestions`
8. tests turning `it.todo` into real assertions (inline or final commit)
