# Product Invariants

Properties that must **always hold**, regardless of which feature is added or changed. Invariants are **guardrails** — they fail the moment the code drifts.

## How this file is organized

**Invariants are categorized by what they constrain, not by which feature added them.** New features extend existing categories — they do not get their own sections. This is the principle that lets the file scale: a project with 200 invariants across 40 features still has the same handful of categories, and every new invariant has an obvious home.

| Prefix      | Category                                                                                 | Verified at                              |
| ----------- | ---------------------------------------------------------------------------------------- | ---------------------------------------- |
| `DATA-*`    | Shape and integrity of stored data (Mongoose docs, refs, required fields, indexes)       | Layer 2 (vitest + mongodb-memory-server) |
| `LOGIC-*`   | Pure function contracts (input → output, immutability, idempotence, round-trips)         | Layer 2 (vitest)                         |
| `API-*`     | HTTP contract: status codes, response schemas, idempotency, pagination, error shape      | Layer 2 (jest + supertest)               |
| `UI-*`      | DOM / rendering checkable in jsdom (element exists, aria reflects state, list lengths)   | Layer 2 (vitest + Testing Library)       |
| `SEC-*`     | Authorization (no IDOR, owner-only access, no PII in logs, no secrets in responses)      | Layer 2 (jest + supertest)               |
| `PRIVACY-*` | Data flow boundaries — what reaches AI prompts, third parties, telemetry                 | Layer 2 + Layer 3                        |
| `AI-*`      | Contracts around LLM/embedding calls (prompt shape, idempotent caching, dim consistency) | Layer 2                                  |
| `PWA-*`     | Manifest valid, service worker installs, offline shell loads, install prompt fires       | Layer 3 (Playwright)                     |
| `BROWSER-*` | Visual/behavioral: contrast, mobile layout without horizontal scroll, animations         | Layer 3 (Playwright)                     |

**Good invariants describe the product, not the implementation.** A solid invariant survives any rewrite — if swapping React for Solid, swapping Mongoose for Prisma, or renaming functions would invalidate it, it's a unit test in disguise. Aim for properties of stored data, observable HTTP behavior, or rendered output. Naming a specific function is OK _only_ when that function is part of the project's stable public API; never when the feature itself is creating the function.

When adding an invariant, decide what it constrains and append to the matching section. **Don't create a new per-feature section.** If nothing fits, the right move is to question the invariant — most "feature-specific" invariants reduce to one of the above when phrased as a falsifiable property.

Tests use `describe("<ID>: <description>", ...)` to map back to this file.

---

## DATA — data shape and integrity

| ID      | Invariant                                                                                                                                                                                                       | Severity |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| DATA-01 | Every `User` document has a non-empty `id` (uuid v4) and a unique, lowercase `email`                                                                                                                            | Critical |
| DATA-02 | Every `User` document has a non-empty, unique `googleId` (the Google `sub` claim)                                                                                                                               | Critical |
| DATA-03 | Every `search_cache` document has `expiresAt` set strictly after its creation time; the TTL index drops it at `expiresAt`; `queryHash` is unique in the collection                                              | High     |
| DATA-04 | `search_history` has a unique compound index `(userId, query)`; submitting the same normalized query twice for the same user creates exactly one document (dedupe at the DB level) and increments `searchCount` | High     |

**Test files:** `tests/invariants/data/users.test.ts`, `tests/invariants/data/search.test.ts`

---

## LOGIC — pure function contracts

| ID       | Invariant                                                                                                                                                                                            | Severity |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| LOGIC-01 | The search aggregator's dedupe + merge function is deterministic: given the same list of provider results, it always produces the same output regardless of how many times it is called              | High     |
| LOGIC-02 | The `withTimeout` helper resolves within `timeout + 100ms` even when the wrapped promise never settles                                                                                               | High     |
| LOGIC-03 | Dedupe collapses results that share an ISRC, or whose normalized title + artist are within a Levenshtein distance of 3, into a single result whose `sources` array lists every contributing provider | High     |
| LOGIC-04 | The web-core `searchTracks` fetcher validates the API response against the `SearchResponse` Zod schema and throws a `ZodError` when the response body does not match the schema                      | High     |

**Test files:** `tests/invariants/logic/search.test.ts`, `tests/invariants/logic/search-web.test.ts`

---

## API — HTTP contract

| ID     | Invariant                                                                                                                                                                                            | Severity |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| API-01 | Every error response from `apps/api` matches the shared `ErrorResponse` Zod schema                                                                                                                   | Critical |
| API-02 | `GET /api/auth/me` returns 401 + `ErrorResponse` with no/invalid session cookie; returns 200 + a body matching the `User` Zod schema with a valid session cookie                                     | Critical |
| API-03 | `POST /api/search` is publicly accessible (no session required); returns 400 + `ErrorResponse` when `q` is empty or missing                                                                          | Critical |
| API-04 | `POST /api/search` always returns 200 with a body matching `SearchResponse` (`results`, `partial`, `failedProviders`, `cached`), even when all providers fail (`results: []`, `partial: true`)       | Critical |
| API-05 | `GET /api/search/history` requires a valid session cookie; returns 401 + `ErrorResponse` when no session is present                                                                                  | Critical |
| API-06 | Cursor pagination on `GET /api/search/history` is stable: issuing the same cursor twice returns the same page of entries (no skipped or duplicated entries when the underlying data has not changed) | High     |

**Test files:** `tests/invariants/api/auth.test.ts`, `tests/invariants/api/search.test.ts`

---

## UI — DOM / rendering, checkable in jsdom

| ID    | Invariant                                                                                                                                                                                                 | Severity |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| UI-01 | The app shell renders a routed bottom navigation for all users regardless of authentication state; the sign-in flow is not shown at the root shell level                                                  | High     |
| UI-02 | The bottom navigation is visible on every routed page (`/explore`, `/taste`, `/search`, and the not-found fallback) regardless of authentication state                                                    | High     |
| UI-03 | Exactly one bottom-nav tab carries `aria-current="page"` at any time, matching the current route path                                                                                                     | High     |
| UI-04 | When the search input is empty and there is no per-user history, the suggestions block ("Try: …") is visible in the results area                                                                          | High     |
| UI-05 | When a search request is in flight, a skeleton loading indicator is visible in the results area; previous results are replaced by the skeleton                                                            | High     |
| UI-06 | On a successful response with non-empty results, every result in the response is rendered as a `ResultRow`; track rows show title+artist and station rows show a "Live" indicator                         | High     |
| UI-07 | When the authenticated user has ≥ 1 search history entry and the input is empty, the history list is visible in the results area and the static suggestions block is not rendered                         | High     |
| UI-08 | Pressing Enter in the search input on `/search` removes focus from the input element (so the on-screen keyboard dismisses on touch devices); the active element after Enter is no longer the search input | Medium   |

**Test files:** `tests/invariants/ui/auth.test.tsx`, `tests/invariants/ui/nav.test.tsx`, `tests/invariants/ui/search.test.tsx`

---

## SEC — authorization and credential hygiene

| ID     | Invariant                                                                                                                                                                                           | Severity |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| SEC-01 | The session cookie value, the `oauth_state` cookie value, the `SESSION_SECRET`, and the `GOOGLE_CLIENT_SECRET` never appear in any HTTP response body or structured log line                        | Critical |
| SEC-02 | `GET /api/auth/google/callback` returns a 4xx error when the `state` query param is missing or does not match the value in the `oauth_state` cookie                                                 | Critical |
| SEC-03 | Routes outside the public allowlist (`GET /health`, `GET /api/auth/google`, `GET /api/auth/google/callback`, `POST /api/auth/logout`, `POST /api/search`) return 401 without a valid session cookie | Critical |
| SEC-04 | `GENIUS_ACCESS_TOKEN` never appears in any HTTP response body at any route, whether or not the request succeeds                                                                                     | Critical |
| SEC-05 | `GET /api/search/history` for user A never returns entries owned by user B; the endpoint scopes all results to the authenticated session's `userId`                                                 | Critical |

**Test files:** `tests/invariants/sec/auth.test.ts`, `tests/invariants/sec/search.test.ts`

---

## PRIVACY — data flow boundaries

| ID         | Invariant                                                                                                                                                                                                                        | Severity |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| PRIVACY-01 | Outgoing HTTP requests to Audius, Deezer, Radio Browser, and Genius carry only the search query string; no user identifier, session token, or IP forwarding header is added by our aggregator code                               | Critical |
| PRIVACY-02 | `search_history` content (query strings and `userId` mappings) never leaves the database tier; the search aggregator (providers, cache) is entirely unaware of history — no history data reaches third-party APIs or LLM prompts | Critical |

**Test files:** `tests/invariants/privacy/search.test.ts`

---

## AI — LLM and embedding contracts

_No invariants yet. Examples:_

- _Embedding vectors written to and queried from the taste store have the same dimensionality as the configured model._
- _A given `(userId, tasteInput)` produces a deterministic cache key — re-runs hit the cache, not the model._
- _Prompts never exceed the configured context budget; the truncation policy is invariant-tested._

---

## PWA — installability and offline behavior

| ID     | Invariant                                                                                                                                                | Severity |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| PWA-01 | Refreshing the browser on `/explore`, `/taste`, or `/search` rehydrates to the same route — the matching bottom-nav tab is highlighted after rehydration | High     |

**Test files:** `tests/invariants/pwa/routing.test.ts` (Layer 3 — Playwright, stubs pending)

---

## BROWSER — verified by Layer 3 (Playwright)

| ID         | Invariant                                                                                                                                                                                                  | Severity |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| BROWSER-01 | On a 375×667 mobile viewport, each bottom-nav tab has a touch target ≥ 44×44 px and the nav applies `env(safe-area-inset-bottom)` so no content is occluded by the iOS home indicator                      | High     |
| BROWSER-02 | On a 375×667 mobile viewport, the search input is visible at the top of the viewport without scrolling; results are scrollable below it; the bottom nav remains fixed and does not occlude the last result | High     |

**Test files:** `tests/invariants/browser/bottom-nav.test.ts`, `tests/invariants/browser/search.test.ts` (Layer 3 — Playwright, stubs pending)

---

## Adding invariants for new features

When you start a feature:

1. Identify what the invariant constrains — data shape, function contract, HTTP, DOM, security, privacy, AI, PWA, or browser-only.
2. Append a row to the matching category above with the next available ID (e.g. `DATA-02`, `LOGIC-01`).
3. Stub the test in the relevant `tests/invariants/<category>/*.test.ts` file using `describe("<ID>: <description>", ...)`.
4. Confirm the test fails (red) before implementing.
5. Only then implement the feature.

Run `/new-invariant` for a guided walkthrough.
