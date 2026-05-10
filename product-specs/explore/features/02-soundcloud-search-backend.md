---
epic: explore
status: done
estimated-invariants: 5
implemented-in-pr: https://github.com/alibehroozi/musy/pull/23
---

# Feature 02: SoundCloud search backend

## Product description

SoundCloud already powers playback resolution (HTML scrape + transcoding URLs) but is not a _search_ provider in moc today. The aggregator currently hits Audius, Deezer, Radio Browser, and Genius. SoundCloud has the broadest catalog of recent / lesser-known music — Audius's coverage is sparser. Adding SoundCloud to the search aggregator means the Explore epic's queue can pull primarily from SoundCloud (the primary search engine per the epic's framing) and the existing Search tab gets richer results immediately as a side benefit.

The implementation pattern mirrors the Audius provider in `apps/api/src/modules/search/providers/`: a thin client that wraps SoundCloud's public web search endpoints (the same endpoints the SC web player uses, reachable with the spoofed `SOUNDCLOUD_USER_AGENT` we already configure for the resolver), parses results into the shared `TrackResult` shape, and feeds them through the existing dedupe + merge pipeline.

## User behavior

This is a backend feature with one user-visible consequence: search results in `/search` start including SoundCloud hits, identifiable by a `SoundCloud` source badge. No new pages or controls.

Manual exercise:

1. `curl -X POST http://localhost:3001/api/search -H 'content-type: application/json' -d '{"q":"levitating dua lipa"}'` returns results that include at least one entry with `sources` containing `"soundcloud"`.
2. Open `/search` in the web app, query "lo-fi study beats" → results include SoundCloud entries; the source badge reads "SoundCloud".
3. Query an obscure / non-music string ("asdkjhasdkjh") → results may be empty; `partial: false`; `failedProviders: []` if SC responded with no results (vs. errored).
4. Force a SoundCloud outage (block its host in `/etc/hosts`) → search still returns 200 with `partial: true`, `failedProviders: ["soundcloud"]`.

**Failure modes the user can reach:**

- SC search times out → `failedProviders` includes `"soundcloud"`; other providers' results still ship; UI shows the existing partial-results indicator.
- SC's response shape changes → parser fails gracefully, returns `[]`, treated as "no results from this provider"; logged for telemetry.
- SC rate-limits us → 429 from upstream → same path as timeout.

**Empty / first-run state:** not applicable — backend feature.

## Design

**Visual mockup:** none — backend feature.
**DS components used:** none — the existing Search UI handles `"soundcloud"` as a new value of `ProviderName` automatically via the existing source-badge rendering.
**DS components required but missing:** none.
**Layout notes:** the existing `ResultRow`'s source-badge rendering needs to handle the new `"soundcloud"` value. Verify it's already generic (the badge today renders a humanized form of the literal); if not, add the human-readable display name in one place.

## Backend

**New endpoints:** none. `POST /api/search` is unchanged in shape; new results just appear in the `results` array with `sources` containing `"soundcloud"`.

**New / changed Mongoose collections:** `search_cache` already keys on the query hash and stores the merged result — no schema changes needed; SoundCloud results flow through transparently. Existing `DATA-03` TTL applies.

**New env vars:** none new. Reuses `SOUNDCLOUD_USER_AGENT` already declared in `apps/api/.env.example` from the play-resolver feature.

**Provider client:**

- New file: `apps/api/src/modules/search/providers/soundcloud.provider.ts`.
- Hits SoundCloud's public search endpoint (the same one the web player uses) with the spoofed UA + a per-call extracted `client_id` (the resolver already knows how to obtain one from a fresh page fetch — extract that helper into `libs/api/core/play/soundcloud-parser.ts` or a sibling so search and resolver share it).
- Per-call timeout 4 s (matches existing convention; uses `withTimeout` from `libs/api/core/search/`).
- Parses raw JSON into `TrackResult` shape.

**Contracts:** `ProviderName` literal union in `libs/shared/contracts/src/search.ts` adds `"soundcloud"`. Existing consumers (`SearchResponse.failedProviders`, `TrackResult.sources`) inherit it.

## Tooling

**New deps:** none. The shared `client_id` extraction helper is plain HTML scraping with `linkedom` (already in deps from the playback epic).

**External services:**

- **SoundCloud (public web search)** — free, no key, TOS-grey just like the resolver. Same `SOUNDCLOUD_USER_AGENT` rotation strategy applies.

## Privacy

What data crosses which boundary:

- User → API: the search query.
- API → SoundCloud: the query string only — no user identifier, no session cookie, no `X-Forwarded-*` header (mirrors the existing Audius posture per `PRIVACY-01`).
- API → LLM prompt: none.
- Stays server-only: the extracted `client_id`, the `SOUNDCLOUD_USER_AGENT`, the merged `search_cache` documents.

`SEC-07` already covers leak protection for `SOUNDCLOUD_USER_AGENT` and any extracted `client_id` — extend the test to cover the search code path in addition to the resolver.

## Acceptance criteria

- [ ] `POST /api/search` with `q="dua lipa levitating"` returns at least one result whose `sources` array contains `"soundcloud"`.
- [ ] Search response continues to match the `SearchResponse` Zod schema (no breaking shape change).
- [ ] Forcing a SoundCloud timeout (test fixture or integration mock) results in `partial: true`, `failedProviders: ["soundcloud"]`, with other providers' results intact.
- [ ] Real-upstream Jest test (per AGENTS.md hard rule #15) hits live SoundCloud and asserts the response parses into ≥ 1 `TrackResult`.
- [ ] No outgoing SC request includes a user identifier, session cookie, or IP-forwarding header.
- [ ] `SOUNDCLOUD_USER_AGENT` and the extracted `client_id` never appear in the response body or any structured log line, in either the search or resolve code paths.
- [ ] Source-badge rendering in `apps/web/src/features/search/components/ResultRow.tsx` displays "SoundCloud" for the new value.

## Suggested invariants

The agent in `/new-invariant` will refine these — they're seeds, not commitments:

- **API-XX:** The `failedProviders` array in a `SearchResponse` includes the literal `"soundcloud"` when the SoundCloud search call times out or errors; never includes it when SC succeeds with zero results.
- **LOGIC-XX:** The dedupe + merge function (extends `LOGIC-01` / `LOGIC-03`) collapses SoundCloud and Audius results that share an ISRC, or whose normalized `(title, artist)` is within Levenshtein 3, into one result whose `sources` array lists both providers.
- **PRIVACY-XX:** Outgoing HTTP requests to SoundCloud's search endpoint carry only the query string and the spoofed User-Agent; no user identifier, session cookie, or `X-Forwarded-*` header (extends `PRIVACY-01`).
- **SEC-XX:** The `SOUNDCLOUD_USER_AGENT` and the extracted SoundCloud `client_id` never appear in the response body of any route in `apps/api`, including `/api/search` (extends `SEC-07`).
- **DATA-XX:** `search_cache` documents storing SoundCloud-inclusive results respect the existing TTL (`DATA-03`); the cache key continues to be unique on the normalized query hash.

## Implementation hint for /new-feature

This file is self-contained.

**Where things live (per ARCHITECTURE.md layering):**

- Contracts in `libs/shared/contracts/src/search.ts`: extend `ProviderName` literal union with `"soundcloud"`.
- Pure logic in `libs/api/core/`: extract `extractClientIdFromHtml(html)` into a shared helper so search and resolver both reuse it. Test against fixture HTML.
- Provider client in `apps/api/src/modules/search/providers/soundcloud.provider.ts` — orchestrates `client_id` fetch + search call + parse. Wraps everything in `withTimeout(4000, ...)`.
- Wire into the aggregator in `apps/api/src/modules/search/search.service.ts`.
- Real-upstream Jest test in `apps/api/src/modules/search/providers/soundcloud.provider.test.ts` per AGENTS.md hard rule #15.

**Suggested commit order:**

1. `spec: add API-XX, LOGIC-XX, PRIVACY-XX, SEC-XX, DATA-XX invariants for SoundCloud search`
2. `test(invariants): stub the new invariants it.todo`
3. `feat(contracts): add "soundcloud" to ProviderName union`
4. `refactor(api-core): extract extractClientIdFromHtml into shared core helper`
5. `feat(api): add SoundCloud search provider + wire into aggregator`
6. tests (real-upstream Jest + invariant assertions turning `it.todo` real)
