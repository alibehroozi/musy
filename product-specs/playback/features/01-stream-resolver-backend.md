---
epic: playback
status: done
estimated-invariants: 7
implemented-in-pr: https://github.com/alibehroozi/musy/pull/18
---

# Feature 01: Stream resolver backend

## Product description

Add a `POST /play/resolve` endpoint that takes a track snapshot — title, artist, optional ISRC and provider info — and returns a streamable audio URL plus the source name. The resolver tries Audius first (using the existing `@audius/sdk` already in the search aggregator); if no Audius match, it falls back to SoundCloud by fetching the track's web page and parsing the embedded JSON for `transcodings[].url` and `client_id`. The mapping `track-snapshot → { source, sourceTrackId }` is cached in MongoDB; the actual stream URL is **not cached** because SoundCloud transcoding URLs expire in hours. Stations are not part of this endpoint — they already carry a stable `streamUrl` from Radio Browser via the Search epic's feat-02.

## User behavior

This is a backend-only feature. The user-visible behavior lands in feature 3 (Player engine + mini-player UI). Manual exercise:

1. `curl -X POST http://localhost:3001/api/play/resolve -H 'content-type: application/json' -d '{"snapshot":{"title":"Get Lucky","artist":"Daft Punk","durationSec":249,"kind":"track"}}'` returns `{ source: "audius", streamUrl: "https://discoveryprovider.../v1/tracks/abc/stream", expiresAt: null }` if Audius matches.
2. The same call for an obscure track Audius doesn't have falls through to SoundCloud and returns `{ source: "soundcloud", streamUrl: "https://api-v2.soundcloud.com/...", expiresAt: <ISO ~1h out> }`.
3. A query for a fully unknown track returns 200 with `{ source: null, streamUrl: null }` — not 404 — so the FE can render the failed-state mini-bar without treating it as an error.
4. Calling the endpoint twice with the same snapshot within 24h hits the cached `(source, sourceTrackId)` and **re-resolves the stream URL fresh** (because of expirations).

**Failure modes the user can reach (via the eventual UI):**

- Both providers return nothing — endpoint responds 200 with `source: null`.
- Audius is reachable but SoundCloud's HTML scrape fails (their embed JSON shape changed) — endpoint logs the error, returns the Audius result if any, otherwise 200 with `source: null`. The aggregator never crashes the request.
- Network partition — request returns 503 with the standard `ErrorResponse` shape.

**Empty / first-run state:** Not applicable — backend feature.

## Design

**Visual mockup:** none — backend feature.
**DS components used:** none.
**DS components required but missing:** none.
**Layout notes:** none.

## Backend

**New endpoints:**

- `POST /play/resolve` `@Public()` — body `{ snapshot: SongSnapshot }` (Zod-validated; `SongSnapshot` is the same shape introduced in Search feat-05: `{ title, artist, kind: "track" | "station", coverUrl?, year?, durationSec? }`). Returns `{ source: "audius" | "soundcloud" | null, sourceTrackId: string | null, streamUrl: string | null, expiresAt: string | null }`. Public so anonymous users can listen (per epic constraint). Rate limit: 30 req/min per IP — same convention as `/search`.

**New / changed Mongoose collections:**

- `play_resolutions` — fields:
  - `snapshotHash: string` (sha256 of normalized `${title}|${artist}|${durationSec}`) — unique index
  - `snapshot: SongSnapshot` — full snapshot, for debugging
  - `source: "audius" | "soundcloud" | null`
  - `sourceTrackId: string | null` (Audius track ID, or SoundCloud track ID extracted from the page)
  - `resolvedAt: Date`
  - `expiresAt: Date` — TTL index, 24h after creation. After expiry, re-resolve from scratch.

The `streamUrl` itself is **never cached** — only the snapshot→`(source, sourceTrackId)` mapping. On every `/play/resolve` call: hit the cache, then call the per-source "produce a fresh stream URL given a sourceTrackId" function (which for Audius is the SDK's stream-redirect helper, and for SoundCloud is a fresh HTML fetch + scrape).

**New env vars:**

- `SOUNDCLOUD_USER_AGENT` (server-only, optional, defaults to a generic browser UA string) — SoundCloud's embed page returns a different JSON shape for non-browser User-Agents; spoofing as a regular browser keeps the scrape stable. Kept configurable so we can rotate it if SoundCloud starts blocking the default. Add to `apps/api/.env.example` with a placeholder.

## Tooling

**New deps:**

- **`linkedom`** (MIT) — pure-JS DOM for parsing the SoundCloud embed page's `<script>` JSON blob. Considered: `jsdom` (much heavier, includes CSS/canvas), regex-only (brittle to SoundCloud's frequent embed-JSON shape rotations).

**External services:**

- **Audius** — already integrated; reused.
- **SoundCloud** — free, no key, TOS-grey for stream extraction (embed JSON is the same data their public web player uses).

## Privacy

What data crosses which boundary:

- User → API: the song snapshot (title, artist, durationSec, etc.). No user identifier required (the route is `@Public()`).
- API → Audius: the snapshot's title + artist as the search query. No user identifier, no IP forwarding header. Same as Search feat-02's `PRIVACY-01`.
- API → SoundCloud: a `GET https://soundcloud.com/<path>` request carrying only the spoofed `User-Agent`. No user identifier, no session cookie.
- API → LLM prompt: none.
- Stays server-only: the `play_resolutions` cache, the SoundCloud-extracted `client_id`, the `SOUNDCLOUD_USER_AGENT` env var.

## Acceptance criteria

- [ ] `POST /play/resolve` with a Daft Punk track snapshot returns `source: "audius"` and a stream URL that returns audio bytes when fetched (HTTP 200 with `audio/*` content-type after redirect).
- [ ] `POST /play/resolve` with an obscure indie track snapshot Audius doesn't have returns `source: "soundcloud"` and a SoundCloud transcoding URL.
- [ ] `POST /play/resolve` with a clearly-fake track snapshot (`title: "asdjkhasd"`, `artist: "qwertyzx"`) returns 200 with `source: null, streamUrl: null`.
- [ ] When SoundCloud's embed JSON shape changes and the scrape throws, Audius results are still returned without 5xx-ing the request.
- [ ] Submitting the same snapshot twice within 24h hits the cache for `(source, sourceTrackId)` (verifiable via response time on cache hit + log line) and **still returns a freshly-produced stream URL** (the URL itself differs across calls for SoundCloud due to per-call `client_id`).
- [ ] No third-party request includes a user identifier, session cookie, or `X-Forwarded-For` header — verifiable via aggregator unit test asserting outgoing request shape.
- [ ] `SOUNDCLOUD_USER_AGENT` is read from env at startup; a missing value falls back to the documented default.
- [ ] Per-provider timeout of 4s is respected (verifiable via integration test mocking a slow provider).

## Suggested invariants

The agent in `/new-invariant` will refine these — they're seeds, not commitments:

- **API-XX:** `POST /play/resolve` is publicly accessible; rejects an empty snapshot with `ErrorResponse` 400; always returns 200 with `source: null` when no provider matches (never 404 for a "not found" track).
- **API-XX:** `POST /play/resolve` response always conforms to a `ResolveResponse` Zod schema, including the case where both providers fail.
- **DATA-XX:** Every `play_resolutions` document has `expiresAt` strictly after `resolvedAt`; the TTL index drops it on schedule; `snapshotHash` is unique.
- **PRIVACY-XX:** Outgoing requests to Audius and SoundCloud carry only the song-snapshot data (title + artist) and our spoofed User-Agent; no user identifier, session cookie, or IP forwarding header is added by our code.
- **SEC-XX:** The `SOUNDCLOUD_USER_AGENT` env var and the extracted SoundCloud `client_id` never appear in any HTTP response body or structured log line at any log level.
- **LOGIC-XX:** The pure SoundCloud-HTML-to-source parser (in `libs/api/core/play/soundcloud-parser.ts`) is deterministic given the same HTML input — no `Date.now()`, no randomness; tested against fixture HTML files.
- **LOGIC-XX:** The `snapshotHash` function is stable: same `(title, artist, durationSec)` → same hash, regardless of whitespace or case.

## Implementation hint for /new-feature

This file is self-contained. The "Product description" becomes the feature description, the "Suggested invariants" seed `/new-invariant`'s exploration, and the "Acceptance criteria" are the manual-exercise checklist before opening the PR.

**Where things live (per ARCHITECTURE.md layering):**

- Contracts in `libs/shared/contracts/src/play.ts`: `ResolveRequest`, `ResolveResponse`, reusing `SongSnapshot` from Search feat-05.
- Pure logic in `libs/api/core/play/`:
  - `snapshot-hash.ts` — the deterministic hash function.
  - `soundcloud-parser.ts` — `extractSourceFromHtml(html: string): { sourceTrackId, clientId, transcodings } | null`. Pure, takes HTML string in, returns parsed result or null.
  - `audius-resolver.ts` — `pickBestMatch(snapshot, audiusResults): { sourceTrackId } | null`. Pure ranking against snapshot duration tolerance.
- NestJS module in `apps/api/src/modules/play/`:
  - `play.module.ts`, `play.controller.ts` (single `/resolve` route), `play.service.ts` (orchestrates Audius-first, SoundCloud-fallback), `play.repository.ts` (`play_resolutions` cache), `play.schema.ts`.
  - Provider clients in `apps/api/src/modules/play/providers/`: `audius-stream.client.ts` (uses `@audius/sdk`'s stream-redirect helper), `soundcloud-stream.client.ts` (HTML fetch + parse via core).
- `apps/api/.env.example`: add `SOUNDCLOUD_USER_AGENT=` (placeholder).
- `/prepare-local` must be updated (AGENTS.md hard rule #9) to mention the new env var.

**Suggested commit order:**

1. `spec: add API-XX, DATA-XX, PRIVACY-XX, SEC-XX, LOGIC-XX invariants for /play/resolve`
2. `test(invariants): stub the new invariants it.todo`
3. `feat(contracts): add ResolveRequest, ResolveResponse Zod schemas`
4. `feat(api-core): add snapshot-hash, soundcloud-parser, audius-resolver pure helpers`
5. `feat(api): add play module — controller, service, repository, schema, providers`
6. tests turning `it.todo` into real assertions
7. `chore: update apps/api/.env.example and .claude/commands/prepare-local.md for SOUNDCLOUD_USER_AGENT`
