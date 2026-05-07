---
epic: search
status: pending
estimated-invariants: 8
---

# Feature 02: Search aggregator backend

## Product description

Add a backend `POST /search` endpoint that takes a single free-text query and returns merged, deduplicated results from four free providers in parallel: **Audius** (open music platform, tracks), **Deezer Public API** (mainstream tracks/artists, metadata only — no playback), **Radio Browser** (live internet radio stations), and **Genius** (lyric-based track search). The endpoint is **public** (anonymous users can search) but is _aware_ of the optional session cookie — when present, the controller will later pipe the query into search history (feature 4); in this feature the endpoint just records nothing. Results are cached in MongoDB with a TTL so repeated queries within an hour are answered from cache. Per-provider failures are tolerated: if a provider times out or errors, the response includes the partial set and a `partial: true` flag.

## User behavior

This is a backend-only feature. The user-visible behavior lands in feature 3 (Search page UI). However, the endpoint can be exercised manually via `curl` for verification:

1. `curl -X POST http://localhost:3001/api/search -H 'content-type: application/json' -d '{"q":"daft punk"}'` returns a JSON body with merged track + station results from all reachable providers.
2. Submitting the same query again within 1h returns the cached result (verifiable via response time and a `cached: true` flag, or by logs).
3. Submitting a lyric-style query (e.g. `"you spin me right round"`) returns at least one Genius-sourced result.
4. Submitting a query with one provider intentionally unreachable (block its host in `/etc/hosts`) returns the other providers' results with `partial: true` and a list of failed providers.

**Failure modes the user can reach (via the eventual UI):**

- Empty query string — endpoint responds 400 with the standard `ErrorResponse` shape.
- All providers fail — endpoint responds 200 with `{ results: [], partial: true, failedProviders: [...] }` (not 5xx; allows the UI to render an empty-results state).
- Network partition during a request — Mongo cache writes are best-effort; a cache-write failure does not fail the response.

**Empty / first-run state:** Not applicable — backend feature.

## Design

**DS components used:** none.

**DS components required but missing:** none.

**Layout notes:** none.

## Backend

**New endpoints:**

- `POST /search` `@Public()` — body `{ q: string }` (validated by Zod), returns `{ results: SearchResult[], partial: boolean, failedProviders: ProviderName[], cached: boolean }`. Rate limit: 30 req/min per IP (avoid DoS-ing the upstream providers).

**New / changed Mongoose collections:**

- `search_cache` — fields:
  - `queryHash: string` (sha256 of normalized query) — unique index
  - `query: string` (the normalized query, for debugging)
  - `results: SearchResult[]` (full payload)
  - `failedProviders: ProviderName[]`
  - `expiresAt: Date` — TTL index, 1h after creation

**New env vars:**

- `GENIUS_ACCESS_TOKEN` (server-only, required) — Genius developer token. Provisioned via the Genius API dashboard; goes in `apps/api/.env.local` for dev and Cloud Run secrets for prod. Add to `apps/api/.env.example` with a placeholder.
- `AUDIUS_APP_NAME` (server-only, optional, defaults to `"moc"`) — identifies the app to Audius rate-limiter; not a secret, but lives server-side for clarity.

## Tooling

**New deps:**

- `axios` or stick with `fetch` — recommend **native `fetch`** (Node 20+ has it built-in). No new dep needed for HTTP. Considered: `axios` (more features but extra weight), `got` (Node-only, fine but not necessary).
- `@audius/sdk` (Apache-2.0) — official Audius SDK. Considered: rolling our own HTTP calls (simpler but loses the SDK's discovery-node failover; SDK is worth the dep).
- For Deezer + Radio Browser + Genius: **plain `fetch` calls** — these APIs are simple REST, no SDK needed.
- `crypto` (Node built-in) — for the queryHash.

**External services:**

- **Audius** — free, key recommended for rate limits, no monthly cap.
- **Deezer Public API** — free, no key, 50 req/sec.
- **Radio Browser** — free, no key, multiple mirror servers.
- **Genius** — free developer tier, ~1 req/sec recommended.

## Privacy

What data crosses which boundary:

- User → API: the query string `q`. No user identifier sent.
- API → third party (Audius, Deezer, Radio Browser, Genius): the query string `q`. **No user identifier**, no IP forwarding, no session info. The user's `req.user.uid` (if present) is _not_ forwarded to any third party.
- API → LLM prompt: none in this feature.
- Stays server-only: the `GENIUS_ACCESS_TOKEN`, the Audius app name, the cache contents.

## Acceptance criteria

- [ ] `POST /search` with `{ q: "daft punk" }` returns at least one result from Audius and one from Deezer in under 3 seconds (cold), under 200ms (cached).
- [ ] `POST /search` with `{ q: "" }` returns 400 with the standard `ErrorResponse` shape.
- [ ] `POST /search` with `{ q: "you spin me right round" }` returns at least one Genius-sourced result.
- [ ] `POST /search` with `{ q: "bbc radio 1" }` returns at least one Radio Browser station result.
- [ ] When a provider intentionally fails (e.g. invalid Genius token), the endpoint still returns the others' results with `partial: true` and the failing provider in `failedProviders`.
- [ ] Submitting the same query twice within 1h: the second response has `cached: true`. After 1h, `cached: false`.
- [ ] `GENIUS_ACCESS_TOKEN` is read from env at startup; missing token fails fast with a clear error during NestJS bootstrap (so the bug isn't hidden until first search).
- [ ] No third-party request includes a user identifier or session header (verifiable via aggregator unit test asserting outgoing request shape).
- [ ] Per-provider timeout of 2.5s is respected (verifiable via integration test mocking a slow provider).
- [ ] Anonymous and authenticated requests both succeed; the controller does not require a session cookie.

## Suggested invariants

The agent in `/new-invariant` will refine these — they're seeds, not commitments:

- **API-03:** `POST /search` is publicly accessible (no session required); rejects empty `q` with `ErrorResponse` 400.
- **API-04:** `POST /search` response always conforms to `SearchResponse` schema (`results: SearchResult[]`, `partial: boolean`, `failedProviders: ProviderName[]`, `cached: boolean`), even when all providers fail (returns `200` with `results: []`, `partial: true`).
- **DATA-03:** Every `search_cache` document has `expiresAt` set in the future relative to `createdAt`; the TTL index drops it on schedule. `queryHash` is unique.
- **PRIVACY-01:** Outgoing third-party requests (Audius, Deezer, Radio Browser, Genius) carry only the query string; no user identifier, no session cookie, no IP forwarding header is added by our code.
- **SEC-04:** `GENIUS_ACCESS_TOKEN` is never present in any HTTP response body or log line at any log level.
- **LOGIC-01:** The aggregator's pure ranking + dedupe function (in `libs/api/core/search/`) is deterministic given the same provider responses (same input → same output, no `Date.now()` or randomness).
- **LOGIC-02:** Per-provider timeout is respected — the aggregator returns within `(timeout + small epsilon)` even if a provider hangs indefinitely.
- **LOGIC-03:** Dedupe across providers: results judged equivalent (same ISRC, or normalized title+artist match within a defined Levenshtein threshold) collapse to a single result with the source list preserved.

## Implementation hint for /new-feature

This file is self-contained. The "Product description" becomes the feature description, the "Suggested invariants" seed `/new-invariant`'s exploration, and the "Acceptance criteria" are the manual-exercise checklist before opening the PR.

**Where things live (per ARCHITECTURE.md layering):**

- Contracts in `libs/shared/contracts/src/search.ts`: `SearchQuery`, `SearchResult` (track + station discriminated union), `SearchResponse`, `ProviderName`.
- Pure logic in `libs/api/core/search/`: per-provider response normalizers (Audius shape → SearchResult, Deezer shape → SearchResult, etc.), the dedupe + merge function, the queryHash function, the timeout-wrapping helper. **No `Date.now()` directly** — accept `now: Date` as a parameter so LOGIC-01 holds.
- NestJS module in `apps/api/src/modules/search/`: controller (HTTP shape only), service (orchestrates parallel calls + cache lookup/write), repository (Mongo `search_cache` queries), schema. Guards: `@Public()` on the controller route.
- Provider clients in `apps/api/src/modules/search/providers/`: one file per provider (`audius.client.ts`, `deezer.client.ts`, `radio-browser.client.ts`, `genius.client.ts`) — each owns the `fetch` call to that provider and returns the raw shape (or throws). Normalizers live in `libs/api/core/search/normalizers/` so they're testable without HTTP.
- `apps/api/.env.example`: add `GENIUS_ACCESS_TOKEN=` (placeholder, no value committed) and `AUDIUS_APP_NAME=moc`.
- `/prepare-local` must be updated (AGENTS.md hard rule #9) to mention the new env var: a developer running `/prepare-local` must be told they need a Genius API token before search will work.

**Suggested commit order:**

1. `spec: add API-03, API-04, DATA-03, PRIVACY-01, SEC-04, LOGIC-01..03`
2. `test(invariants): stub the new invariants it.todo`
3. `feat(contracts): add SearchQuery, SearchResult, SearchResponse Zod schemas`
4. `feat(api-core): add per-provider normalizers, dedupe/merge, timeout wrapper, queryHash`
5. `feat(api): add search module with cache schema, repository, service, controller, providers`
6. tests turning `it.todo` into real assertions (inline or as a final commit)
7. `chore: update apps/api/.env.example and .claude/commands/prepare-local.md for GENIUS_ACCESS_TOKEN`
