---
epic: explore
status: pending
estimated-invariants: 6
---

# Feature 03: Swipe ledger and interest-score extension

## Product description

Capture every Explore-tab swipe as an authoritative event. A right-swipe is a strong "I like this" signal — the song's `interest_scores.score` rises to `max(score, 8)` (matching `saved=8` from the Search epic; the explore right-swipe and the search-row save are equivalent strength). A left-swipe is a "not for me" signal — recorded only in the `swipes` ledger, **without** any negative impact on `interest_scores`. Left-swipes stay the dedicated rejection record at the per-event level; the score itself stays positive-only.

This is a pure backend feature: a new endpoint `POST /api/explore/swipe`, a new `swipes` collection, and an extension of the existing `bumpScore` helper for the new event types. The Explore UI (feature 6) calls it; nothing user-visible changes until then. Feature 4 (taste profile) and feature 5 (queue) read from the ledger.

## User behavior

Backend feature; user-visible behavior lands in feature 6. Manual exercise:

1. Sign in via the existing Google flow → get a session cookie.
2. `curl -X POST http://localhost:3001/api/explore/swipe -H 'content-type: application/json' --cookie "$COOKIE" -d '{"snapshot":{"title":"Bohemian Rhapsody","artist":"Queen","durationSec":354,"kind":"track"},"direction":"right"}'` returns 204.
3. Mongo Express at http://localhost:8181 shows a new `swipes` document with `direction: "right"`, the snapshot, and `at` set.
4. `interest_scores` for `(userId, songKey)` shows `score: 8` (or higher if a prior `saved` event already pushed it above 8).
5. Repeat with `direction: "left"` for a different snapshot → the `swipes` doc is recorded; `interest_scores` is **not** touched (no entry created if none existed; existing entries unchanged).
6. Repeat the same right-swipe a second time → the `swipes` ledger now has two entries; `interest_scores.score` is unchanged at 8 (monotonic).

**Failure modes the user can reach (via feature 6):**

- Network error on swipe send → the FE buffers and retries (feature 6's responsibility); BE handles idempotency by allowing duplicate swipes (the ledger is append-only — multiple identical entries are valid).
- Body fails Zod schema → 400 with `ErrorResponse`.
- No session cookie → 401 with `ErrorResponse`.
- Body claims a `userId` field → it is ignored (server derives `userId` from session, mirrors `SEC-08`).

**Empty / first-run state:** not applicable — backend feature.

## Design

**Visual mockup:** none — backend feature.
**DS components used:** none.
**DS components required but missing:** none.
**Layout notes:** none.

## Backend

**New endpoints:**

- `POST /api/explore/swipe` (auth-required) — body `{ snapshot: SongSnapshot, direction: "right" | "left" }`, returns 204 on success. Zod-validated via `nestjs-zod` against the new `SwipeRequest` contract. `userId` derived from the session, never read from the body.

**New / changed Mongoose collections:**

- `swipes` (new) — fields:
  - `id: string` (uuid v4)
  - `userId: string`
  - `snapshot: SongSnapshot` (full snapshot, mirrors what `listening_events` stores)
  - `snapshotHash: string` (computed via the existing `computeSnapshotHash` from `LOGIC-05`; stored for fast "did this user already swipe on this song?" lookups in features 4 / 5)
  - `direction: "right" | "left"`
  - `at: Date`
  - Compound index `(userId, at)` for newest-first reads.
  - Compound index `(userId, snapshotHash)` for duplicate-suppression queries.

- `interest_scores` (existing, extended): a right-swipe upserts a doc following the existing pattern from Search (`DATA-05` / `DATA-06` / `DATA-07`); `interest_scores.snapshot` is recorded on the first event per `DATA-07`. Left-swipes do not write to this collection.

**`bumpScore` extension (pure logic in `libs/api/core/`):**

The existing `bumpScore(oldScore, eventType)` (introduced by `LOGIC-07`) handles `"started"` (→ `max(s, 3)`) and `"completed"` (→ `max(s, 5)`). Extend with:

- `"swiped_right"` → `max(oldScore, 8)`
- `"swiped_left"` → `oldScore` (no-op; the ledger is the only record)

The function stays pure, deterministic, and monotonic.

**New env vars:** none.

## Tooling

**New deps:** none.

**External services:** none.

## Privacy

What data crosses which boundary:

- User → API: the swipe (snapshot + direction) over the auth-cookie session.
- API → third party: nothing. Swipes never leave the database tier (extends `PRIVACY-04` from listening events).
- API → LLM prompt: none in this feature; feature 4 starts using the ledger as LLM input.
- Stays server-only: the entire `swipes` collection.

## Acceptance criteria

- [ ] `POST /api/explore/swipe` with no session cookie returns 401 + `ErrorResponse`.
- [ ] `POST /api/explore/swipe` with a malformed body returns 400 + `ErrorResponse`.
- [ ] A right-swipe writes one `swipes` doc and upserts `interest_scores` to `score >= 8`; the snapshot is recorded on first event (extends `DATA-07`).
- [ ] A left-swipe writes one `swipes` doc and **does not** create or modify any `interest_scores` document.
- [ ] Two consecutive right-swipes on the same snapshot create two `swipes` docs and leave `interest_scores.score` unchanged at 8 (monotonic).
- [ ] A request body containing a `userId` field is ignored — the server derives `userId` from the session (mirrors `SEC-08`).
- [ ] No outgoing third-party HTTP request is fired during the request lifecycle.

## Suggested invariants

The agent in `/new-invariant` will refine these — they're seeds, not commitments:

- **DATA-XX:** Every `swipes` document has `userId, snapshot, snapshotHash, direction ∈ {"right","left"}, at` populated; the collection has compound indexes on `(userId, at)` and `(userId, snapshotHash)`.
- **LOGIC-XX:** `bumpScore(oldScore, "swiped_right")` returns `max(oldScore, 8)`; `bumpScore(oldScore, "swiped_left")` returns `oldScore`. Result never less than `oldScore`; deterministic. (Extends `LOGIC-07`.)
- **API-XX:** `POST /api/explore/swipe` returns 401 + `ErrorResponse` without a session cookie; with a valid cookie and a body matching `SwipeRequest`, returns 204 with no body; returns 400 + `ErrorResponse` on body shape mismatch.
- **SEC-XX:** The `userId` written to `swipes` and `interest_scores` is always derived from `req.user.id`; any `userId` in the request body is ignored (extends `SEC-08`).
- **PRIVACY-XX:** `POST /api/explore/swipe` makes no outgoing third-party HTTP request; swipe data stays in the database tier (mirrors `PRIVACY-04`).
- **DATA-XX:** A right-swipe upserting `interest_scores` respects monotonicity (extends `DATA-06`): `newScore >= oldScore` always.

## Implementation hint for /new-feature

This file is self-contained.

**Where things live (per ARCHITECTURE.md layering):**

- Contracts in `libs/shared/contracts/src/explore.ts` (new file): `SwipeRequest`, `SwipeDirection` literal union.
- Pure logic in `libs/api/core/explore/`:
  - Extend `bumpScore.ts` (move from its current home in `libs/api/core/play/` if appropriate, or just import-and-extend) with the two new event types — keep deterministic + monotonic.
- NestJS module in `apps/api/src/modules/explore/`:
  - `explore.module.ts`, `explore.controller.ts` (only `/swipe` for this feature; `/profile` and `/next` come in later features), `explore.service.ts`, `explore.repository.ts` (`swipes` collection), `explore.schema.ts`.
- Reuse the existing `interest_scores` repository — don't duplicate the upsert logic.

**Suggested commit order:**

1. `spec: add DATA-XX, LOGIC-XX, API-XX, SEC-XX, PRIVACY-XX invariants for swipe ledger`
2. `test(invariants): stub the new invariants it.todo`
3. `feat(contracts): add SwipeRequest, SwipeDirection`
4. `feat(api-core): extend bumpScore with swiped_right and swiped_left event types`
5. `feat(api): add explore module — controller, service, repository, schema for swipe ledger`
6. tests turning `it.todo` into real assertions
