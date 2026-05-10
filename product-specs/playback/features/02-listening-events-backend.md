---
epic: playback
status: done
implemented-in-pr: https://github.com/alibehroozi/musy/pull/19
estimated-invariants: 6
---

# Feature 02: Listening events backend

## Product description

Add two endpoints that record listening events from the player:

- `POST /play/started` — fired when audio actually begins (after the resolver returns and the `<audio>` element produces its first `playing` event). Records an "explored" event in `interest_scores` with `score = max(score, 3)` — semantically identical to the Search epic's feat-05 row-tap, except this fires from the player engine. Captures plays that originate from anywhere (today only search; future epics may add Explore / Taste).
- `POST /play/completed` — fired when audio reaches the end (the `<audio>` `ended` event, not pause or skip-away). Bumps `interest_scores.score = max(score, 5)` — a stronger signal than "tap" but weaker than "save".

Both endpoints also write a row to a new `listening_events` collection capturing the raw event with `elapsedMs` — _every_ event is preserved, even when it doesn't change the interest score. This gives the future taste-modeling AI epic a richer signal: "user plays this song every day for 2 minutes then skips" is detectable from the raw event stream in a way the single `interest_scores` row can't show.

Both endpoints require a valid session cookie. Anonymous users can listen (per epic constraint), but their listening events are dropped on the floor by the FE — no anonymous writes, ever.

## User behavior

This is a backend-only feature. The user-visible behavior lands in feature 3 (Player engine + mini-player UI). Manual exercise:

1. With a valid session cookie:
   `curl -X POST http://localhost:3001/api/play/started -H 'content-type: application/json' -H 'cookie: session=...' -d '{"source":"audius","externalId":"abc123","snapshot":{"title":"Get Lucky","artist":"Daft Punk","kind":"track","durationSec":249}}'`
   returns 204.
2. Verify in Mongo Express: a row exists in `interest_scores` with `score: 3, lastEventType: "explored"` (or `firstEventType: "explored"` if first event for this song). A row exists in `listening_events` with `eventType: "started", elapsedMs: 0`.
3. Then:
   `curl -X POST http://localhost:3001/api/play/completed -H 'content-type: application/json' -H 'cookie: session=...' -d '{"source":"audius","externalId":"abc123","snapshot":{...},"elapsedMs":249000}'`
   returns 204.
4. The same `interest_scores` row now has `score: 5, lastEventType: "completed"`. A second row in `listening_events` has `eventType: "completed", elapsedMs: 249000`.
5. Sending `/play/completed` for a track that was previously **saved** (score 8 from Search feat-05) leaves the saved score at 8 — the `max` rule prevents downgrade. `lastEventType` updates to `"completed"`.
6. Without a session cookie: 401 with `ErrorResponse`.

**Failure modes the user can reach (via the eventual UI):**

- Network failure during a fire-and-forget event POST — silently dropped on the FE side; no toast (per epic Phase-3 decision: don't bother the user with a toast for analytics-style calls).
- Backend rejects an event for an unknown `source` — programming error (covered by contracts validation); not a user-facing case.

**Empty / first-run state:** Not applicable — backend feature.

## Design

**Visual mockup:** none — backend feature.
**DS components used:** none.
**DS components required but missing:** none.
**Layout notes:** none.

## Backend

**New endpoints:**

- `POST /play/started` (auth required) — body `{ source: ProviderName, externalId: string, snapshot: SongSnapshot }`, returns 204. Records a "started" event in `listening_events` (with `elapsedMs: 0`) and upserts `interest_scores` with `score = max(oldScore, 3)`. The upsert sets `lastEventType: "explored"` (semantic match — score 3 is the explored signal regardless of which code path produced it).
- `POST /play/completed` (auth required) — body `{ source: ProviderName, externalId: string, snapshot: SongSnapshot, elapsedMs: number }`, returns 204. Records a "completed" event in `listening_events` (with the actual elapsed-ms) and upserts `interest_scores` with `score = max(oldScore, 5)`. Sets `lastEventType: "completed"`.

Both endpoints upsert the same `interest_scores` document by `(userId, songKey)` where `songKey = ${source}:${externalId}` — the same shape Search feat-05 introduced. The `snapshot` is written **once** on first event and never overwritten (so a track that gets saved later doesn't lose its first-event metadata).

**New / changed Mongoose collections:**

- `listening_events` — new collection. Fields:
  - `userId: string` (User.id)
  - `source: ProviderName`
  - `externalId: string`
  - `songKey: string` (computed: `${source}:${externalId}`)
  - `eventType: "started" | "completed"`
  - `elapsedMs: number` (0 for `started`, actual playback duration for `completed`; non-negative)
  - `at: Date` (server-set timestamp)
  - Compound index `(userId, songKey, at)` for future query patterns ("when did the user last listen to X?").
- `interest_scores` — _modified_: the existing collection from Search feat-05 needs its `lastEventType` enum extended to include `"completed"` (was `"explored" | "saved"`). The score-bump function moves from inline service code to a pure helper in `libs/api/core/play/score-bump.ts` so the rule is testable and stable across the three score values (3 / 5 / 8). No other shape changes.

**New env vars:** none.

## Tooling

**New deps:** none.

**External services:** none — this feature is internal write-only.

## Privacy

What data crosses which boundary:

- User → API: the song snapshot, source, externalId, and (for completed) `elapsedMs`. The session cookie is sent automatically by the browser; the API uses the user ID from the session, never trusts any `userId` in the body.
- API → third party: **none** — this feature does not call any external service.
- API → LLM prompt: none in this feature.
- Stays server-only: every row in `listening_events` and the bumped `interest_scores`. Mirror of Search feat-05's `interest_scores` privacy boundary.

## Acceptance criteria

- [ ] `POST /play/started` for an authenticated user who has never seen this track creates a new `interest_scores` document with `score: 3, firstEventType: "explored", lastEventType: "explored"`, plus a `listening_events` row with `eventType: "started", elapsedMs: 0`.
- [ ] `POST /play/completed` for the same user + track bumps the `interest_scores.score` to `5`, sets `lastEventType: "completed"`, and adds a second `listening_events` row with the supplied `elapsedMs`.
- [ ] `POST /play/completed` for a track previously **saved** (score 8) leaves `interest_scores.score` at `8` — the `max` rule. `lastEventType` still updates to `"completed"`.
- [ ] `POST /play/started` and `/play/completed` without a session cookie return 401 with `ErrorResponse`.
- [ ] Any `userId` in the request body is ignored — the server always derives `userId` from the session.
- [ ] User A's `listening_events` are never readable by user B (no read endpoint ships in v1, but the compound index supports owner-scoped reads in future).
- [ ] Both endpoints return 204 with no body — they are fire-and-forget on the FE.

## Suggested invariants

The agent in `/new-invariant` will refine these — they're seeds, not commitments:

- **API-XX:** `POST /play/started` and `POST /play/completed` both require a valid session cookie; both return 401 + `ErrorResponse` when missing.
- **API-XX:** Both endpoints validate the body against a `PlayEventRequest` Zod schema and reject malformed bodies with 400 + `ErrorResponse`. Server never reads `userId` from the body.
- **DATA-XX:** Every `listening_events` document has `userId`, `songKey`, `eventType`, and `at` populated; `elapsedMs >= 0`. Compound index `(userId, songKey, at)` exists.
- **LOGIC-XX:** The pure `bumpScore(oldScore: number, eventType: "started" | "completed"): number` function in `libs/api/core/play/` returns `max(oldScore, 3)` for `"started"`, `max(oldScore, 5)` for `"completed"` — never decreasing the score, deterministic, no I/O.
- **SEC-XX:** A user A cannot influence the `interest_scores` or `listening_events` of user B by any combination of body fields; the server always derives `userId` from the session.
- **PRIVACY-XX:** No outgoing third-party HTTP request is made by either endpoint — the listening data stays in our database tier (mirror of Search feat-05's `PRIVACY-02`).

## Implementation hint for /new-feature

This file is self-contained. The "Product description" becomes the feature description, the "Suggested invariants" seed `/new-invariant`'s exploration, and the "Acceptance criteria" are the manual-exercise checklist before opening the PR.

**Where things live (per ARCHITECTURE.md layering):**

- Contracts in `libs/shared/contracts/src/play.ts`: extend with `PlayStartedRequest`, `PlayCompletedRequest`, both reusing `SongSnapshot` from Search feat-05.
- Pure logic in `libs/api/core/play/`:
  - `score-bump.ts` — `bumpScore(oldScore: number, eventType: "started" | "completed"): number`. Tested in vitest.
- NestJS module in `apps/api/src/modules/play/` (extends feature 1's module):
  - `play.controller.ts` — adds `/started` and `/completed` routes. Auth-required (no `@Public()` on these).
  - `play.service.ts` — adds `recordStarted` and `recordCompleted` methods, calling `bumpScore` for the score logic.
  - `listening-events.repository.ts` — new repository for the new collection.
  - `listening-events.schema.ts` — new schema.
  - `interest-scores.repository.ts` — modified: delegate score logic to the pure `bumpScore` helper (and Search feat-05's existing tap/save logic likewise migrates to the helper for consistency).

**Suggested commit order:**

1. `spec: add API-XX, DATA-XX, LOGIC-XX, SEC-XX, PRIVACY-XX invariants for /play/started and /play/completed`
2. `test(invariants): stub the new invariants it.todo`
3. `feat(contracts): add PlayStartedRequest, PlayCompletedRequest Zod schemas`
4. `feat(api-core): add bumpScore pure helper`
5. `feat(api): add /play/started and /play/completed routes — listening_events schema, repository, service updates; extend interest_scores lastEventType enum`
6. `refactor(api): migrate Search feat-05's score-bump logic to use the bumpScore helper`
7. tests turning `it.todo` into real assertions
