# Backlog

Current work and what's next. Agents pick from "Ready" (top of the list first). Move items between sections as state changes — keep this file the source of truth for "what to do next."

## Ready

These are picked up first. Each task should be small enough to land in one PR.

- [ ] **AUTH-01: passwordless email magic-link login** — issue a one-time code, exchange for a session cookie. Invariants needed: `SEC-*` (rate limit on issuance, code single-use), `API-*` (`POST /auth/magic-link` shape), `DATA-*` (codes expire, are hashed at rest).
- [ ] **TASTE-01: taste-input ingestion endpoint** — accept a list of (track, signal) pairs and persist them. Invariants needed: `DATA-*` (taste-event document shape), `API-*` (idempotency on `(userId, trackId, signal)`), `PRIVACY-*` (no third-party sink).

## In progress

_Empty. Move items here as they're picked up. Include the branch name._

## Blocked

_Empty. Note what's blocking and on whom._

## Done (recent)

_Empty. Keep the last ~10 to give agents short-term memory of recently-touched areas._

---

## Stretch / later

These are scoped but lower priority. Don't pick from here while "Ready" has items.

- [ ] **TASTE-02: AI taste profile generation** — given a user's taste events, produce a profile vector via embeddings. Decide model, cache strategy, and `AI-*` invariants before implementing.
- [ ] **PWA-01: offline shell** — app loads and shows last-cached state when offline. `PWA-*` invariants required.
- [ ] **REC-01: recommendation endpoint** — return ranked tracks given a profile. Heavy on `PRIVACY-*` — never bleed across users.
- [ ] **PROVIDER-01: Spotify OAuth connect** — store refresh token encrypted-at-rest. `SEC-*` invariants for token storage are mandatory.

---

## How to pick a task (for agents)

1. Read the top item under **Ready**.
2. Confirm scope is single-PR. If not, split it and update this file.
3. Move it to **In progress** with a branch name.
4. Follow the invariant workflow in `AGENTS.md`.
5. Open a PR. Pipeline must be green before requesting review.
6. After merge, move to **Done (recent)** with the PR link, and trim the section to the last 10.
