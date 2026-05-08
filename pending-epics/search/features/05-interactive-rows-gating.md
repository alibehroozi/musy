---
epic: search
status: done
estimated-invariants: 7
implemented-in-pr: https://github.com/alibehroozi/musy/pull/8
---

# Feature 05: Interactive rows — explored, saved, sign-in gating

## Product description

Make the result rows interactive. Each row has two distinct interactions:

1. **Tap anywhere on the row** — for an authenticated user, this records an "**explored**" event for that song with interest score **3**. Visible feedback: the row briefly highlights (subtle background flash, ~200ms).
2. **Tap the add button** (an `IconButton` placed in the trailing slot of every `ResultRow`) — for an authenticated user, this records a "**saved**" event for that song with interest score **8**. Visible feedback: the button transitions from outline to filled (heart or plus icon). No browse view of saved songs ships in this epic.

For an **anonymous** user, both interactions instead open a **sign-in modal** (DS component) with copy like "Sign in with Google to save and explore". The modal contains a single Google sign-in button reusing the existing `/api/auth/google` flow; on successful sign-in the user lands back on Search and their interaction is _not_ automatically retried (kept simple — they can tap again).

The backend stores these events in a single **`interest_scores`** collection — one document per `(userId, songKey)`. Each event upserts the document and applies the rule **`score = max(oldScore, eventScore)`** so a save (8) is never erased by a subsequent tap (3). The document also stores a `snapshot` of the song's metadata (title, artist, cover, source) on first event so future epics can render saved songs without re-querying the providers (whose external IDs may be unstable).

## User behavior

1. Anonymous user submits a search → results render → user taps a row → sign-in Modal opens.
2. Anonymous user dismisses the modal (backdrop tap or close button) → modal closes; row is unchanged; user can keep browsing.
3. Anonymous user taps the add (heart) button → same sign-in Modal opens.
4. Anonymous user signs in via the modal → modal closes; user lands on Search; they re-tap the row to actually record the action.
5. Authenticated user taps a row → row briefly flashes; an "explored" event is sent (`POST /search/explored`); request is fire-and-forget on the UI side (no spinner, no waiting).
6. Authenticated user taps the add button on a row → button switches from outline to filled state immediately (optimistic); a "saved" event is sent (`POST /search/saved`).
7. Authenticated user taps a row they previously saved → row flashes ("explored" fires); the saved button stays filled; the score in the database stays at 8 (max rule).
8. Authenticated user taps the add button on a row they previously saved → the request is sent again; the database score stays at 8; UI is idempotent.
9. Network error during an event POST → silently drop on the floor (don't bother the user with a toast for a background analytics-style call). The optimistic save-button state is **not** rolled back on transient failures (acceptable trade-off; if the user really wanted it saved they can tap again).

**Failure modes the user can reach:**

- Modal opens behind the bottom nav on small screens — modal must be `z-modal` from the design tokens, above all chrome.
- User signs in successfully but the modal doesn't close — modal listens to the `AuthContext` status and closes on `authenticated`.
- Backend rejects the event for an unknown `source` — this is a programming error (we control the providers); covered by contracts validation, not a user-facing case.

**Empty / first-run state:** Not applicable — interactions only matter once results exist.

## Design

**DS components used:** `Modal` (the new component), `IconButton` (the new component), `Button` (existing primary, lg, full-width — for the Google sign-in button inside the modal), Typography (h2 for modal title, body for modal copy).

**DS components required but missing:**

- **`Modal`** — bottom-sheet style on mobile (slides up from bottom), backdrop with click-to-close, focus trap, ESC key to close, `z-modal` z-index. Slot for header (title + close X), slot for body, optional slot for footer. Should respect `env(safe-area-inset-bottom)` so the bottom-sheet doesn't sit under the iOS home indicator.
- **`IconButton`** — small touch-target wrapper (44×44 px minimum, padding around a smaller visible icon), variants `default` and `filled`, sizes `sm` and `md`. Used here for the heart/plus add button. Visually distinct hover/active states.
- Additional icons (via the `Icon` wrapper from feature 1): `plus` or `heart` (outline + filled variants for the save button), `x` (modal close).

**Layout notes:**

- The save button sits in the existing trailing-action slot of `ResultRow` (variants track + station both have it).
- The visible flash on row-tap uses a brief `bg-surface` → `bg-primary/10` → back transition; the `--transition-fast` token.
- Sign-in modal title: "Sign in to save songs". Body: "Sign in with Google to save songs you like and shape your taste profile." CTA: "Continue with Google" (primary button, full width).

## Backend

**New endpoints:**

- `POST /search/explored` (auth required) — body `{ source: ProviderName, externalId: string, snapshot: SongSnapshot }`, returns 204. Records an explored event (score 3).
- `POST /search/saved` (auth required) — body `{ source: ProviderName, externalId: string, snapshot: SongSnapshot }`, returns 204. Records a saved event (score 8).

  Both endpoints upsert the same `interest_scores` document with `score = max(oldScore, newScore)` and update `lastEventType` + `lastEventAt`.

**New / changed Mongoose collections:**

- `interest_scores` — fields:
  - `userId: string` (User.id)
  - `source: ProviderName` (e.g. `"audius"`, `"deezer"`, `"radio-browser"`, `"genius"`)
  - `externalId: string` (provider's track / station ID)
  - `songKey: string` (computed: `${source}:${externalId}`) — kept as an explicit field for query indexing
  - `snapshot: SongSnapshot` (`{ title, artist, coverUrl?, year?, durationSec?, kind: 'track'|'station' }`) — written once on first event, never overwritten
  - `score: number` (1–10)
  - `firstEventType: 'explored' | 'saved'`
  - `lastEventType: 'explored' | 'saved'`
  - `firstEventAt: Date`
  - `lastEventAt: Date`
  - Unique compound index `(userId, songKey)` — guarantees one row per user-per-song.

**New env vars:** none.

## Tooling

**New deps:** none.

**External services:** none new.

## Privacy

What data crosses which boundary:

- User → API: `source`, `externalId`, `snapshot` (the song's public metadata only). Plus the session cookie (already present).
- API → third party: **no third-party request happens during these events.** This is purely server-side persistence. Any future taste-model epic that _uses_ this data must re-evaluate its own privacy boundary.
- API → LLM prompt: none in this feature (taste-aware ranking is a future epic).
- Stays server-only: the entire `interest_scores` collection. Each document is per-user — never exposed to other users.

## Acceptance criteria

- [ ] As an anonymous user, tapping a result row opens the sign-in Modal; no `interest_scores` document is created (verifiable via Mongo Express).
- [ ] As an anonymous user, tapping the add button opens the same sign-in Modal.
- [ ] The sign-in Modal can be dismissed via the close X, the backdrop tap, or pressing ESC (desktop testing).
- [ ] After signing in via the Modal, the Modal closes and the user is on the Search page (not redirected away).
- [ ] As an authenticated user, tapping a row creates an `interest_scores` document with `score: 3, lastEventType: 'explored'`.
- [ ] Tapping that same row again leaves the document at `score: 3` with `lastEventAt` updated; no duplicate document.
- [ ] Tapping the add button on that row sets `score: 8, lastEventType: 'saved'`; the snapshot is unchanged from the first event.
- [ ] Tapping the row again _after_ save leaves `score: 8` (max rule); `lastEventType` becomes `'explored'` and `lastEventAt` updates; the score does not drop to 3.
- [ ] The visible flash on tap is ≤ 250ms total and uses design-token transitions.
- [ ] The save IconButton's filled state persists across re-renders (use a local state seeded from a query against `interest_scores` in a future epic — _for this epic, the optimistic state is only client-side and resets on full reload, which is acceptable_).
- [ ] `POST /search/explored` and `POST /search/saved` without a session return 401.
- [ ] User A's events never appear in User B's `interest_scores` documents (cross-user isolation).
- [ ] Modal `z-index` is above the bottom nav on a mobile viewport.

> **Note on the save-state-persistence trade-off:** This epic intentionally does _not_ ship a `GET /me/saved-songs` endpoint or query the user's existing scores when rendering rows. The save button's "filled" state is purely client-side until a future Library epic adds a hydrated saved-state. Documented here so the next agent doesn't think it's a missing requirement.

## Suggested invariants

The agent in `/new-invariant` will refine these — they're seeds, not commitments:

- **DATA-05:** `interest_scores` has a unique compound index `(userId, songKey)`. Submitting any combination of events for the same user/song results in exactly one document.
- **DATA-06:** `interest_scores.score` is monotonically non-decreasing per `(userId, songKey)`. Any event upsert satisfies `newDoc.score >= oldDoc.score`.
- **DATA-07:** `interest_scores.snapshot` is written on first event and **never overwritten** by subsequent events on the same `(userId, songKey)`.
- **API-07:** `POST /search/explored` and `POST /search/saved` require a valid session (401 when missing).
- **SEC-06:** `interest_scores` documents are scoped per-user; no API endpoint in this feature exposes another user's documents (and `GET /search/history` already excludes them by design).
- **UI-08:** When an anonymous user taps a result row OR the add button, the sign-in Modal opens and no event POST is fired.
- **UI-09:** The sign-in Modal sits at z-index `--z-modal`, above the bottom navigation on a mobile viewport (i.e., is not occluded).

## Implementation hint for /new-feature

This file is self-contained. The "Product description" becomes the feature description, the "Suggested invariants" seed `/new-invariant`'s exploration, and the "Acceptance criteria" are the manual-exercise checklist before opening the PR.

**Pre-flight DS work** (each is its own `/design-system` invocation, before this feature):

1. Add `Modal` DS component.
2. Add `IconButton` DS component.

**Where things live:**

- Contracts in `libs/shared/contracts/src/search.ts` (extend): `SongSnapshot`, `ExploredEventRequest`, `SavedEventRequest`.
- Pure logic in `libs/api/core/search/`: `applyInterestEvent(currentScore: number | null, eventType: 'explored' | 'saved'): { score: number, scoreChanged: boolean }` — encodes the max-rule, fully pure, easy to unit-test.
- NestJS module: extend `apps/api/src/modules/search/` with:
  - `interest-scores.schema.ts` for the Mongoose model.
  - `interest-scores.repository.ts` for the upsert logic (uses the pure function above for the score computation).
  - `search.events.controller.ts` for the two new POST routes (or extend the existing controller).
- Web side: extend `apps/web/src/features/search/`:
  - `components/SignInModal.tsx`.
  - `components/SaveButton.tsx` (wraps `IconButton`, owns the optimistic local state).
  - Update `ResultsList` so each row's onTap and onSave dispatches to either the modal (anon) or the relevant fetcher (auth).
  - `useInterestActions.ts` hook centralizing the dispatch logic + `useAuth()` integration.
- Web-core: add `interestFetcher.ts` with `recordExplored(...)` and `recordSaved(...)` functions.

**Suggested commit order:**

1. `spec: add DATA-05, DATA-06, DATA-07, API-07, SEC-06, UI-08, UI-09`
2. `test(invariants): stub the new invariants it.todo`
3. `feat(contracts): add SongSnapshot, ExploredEventRequest, SavedEventRequest`
4. `feat(api-core): add applyInterestEvent (pure, max-rule)`
5. `feat(api): add interest_scores schema, repository, events controller`
6. `feat(web-core): add interestFetcher`
7. `feat(web): add SignInModal, SaveButton, useInterestActions; wire ResultsList rows to dispatch`
8. tests turning `it.todo` into real assertions (inline or final commit)

**Manual exercise** before opening PR: full anonymous → signed-in flow on a mobile viewport, verifying every acceptance criterion. This feature has the most user-visible behavior of the epic — exercise it thoroughly before claiming done.
