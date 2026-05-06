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

| ID      | Invariant                                                                            | Severity |
| ------- | ------------------------------------------------------------------------------------ | -------- |
| DATA-01 | Every `User` document has a non-empty `id` (uuid v4) and a unique, lowercase `email` | Critical |

**Test files:** `tests/invariants/data/users.test.ts`

---

## LOGIC — pure function contracts

_No invariants yet. Add when the first pure-logic function lands._

---

## API — HTTP contract

_No invariants yet. First entry will typically be: "every error response matches the shared `ErrorResponse` Zod schema"._

---

## UI — DOM / rendering, checkable in jsdom

_No invariants yet._

---

## SEC — authorization and credential hygiene

_No invariants yet. First entries will typically be: "GET /me returns 401 without a valid session", "no response body contains a secret-shaped string"._

---

## PRIVACY — data flow boundaries

_No invariants yet. Examples that will land early in this category:_

- _A recommendation API response never includes another user's listening history._
- _User identifiers (email, real name, IP) never appear in prompts sent to LLM providers unless the call site is explicitly opted in._
- _Telemetry events never contain raw track lists — only aggregated metrics._

---

## AI — LLM and embedding contracts

_No invariants yet. Examples:_

- _Embedding vectors written to and queried from the taste store have the same dimensionality as the configured model._
- _A given `(userId, tasteInput)` produces a deterministic cache key — re-runs hit the cache, not the model._
- _Prompts never exceed the configured context budget; the truncation policy is invariant-tested._

---

## PWA — installability and offline behavior

_No invariants yet._

---

## BROWSER — verified by Layer 3 (Playwright)

_No invariants yet._

---

## Adding invariants for new features

When you start a feature:

1. Identify what the invariant constrains — data shape, function contract, HTTP, DOM, security, privacy, AI, PWA, or browser-only.
2. Append a row to the matching category above with the next available ID (e.g. `DATA-02`, `LOGIC-01`).
3. Stub the test in the relevant `tests/invariants/<category>/*.test.ts` file using `describe("<ID>: <description>", ...)`.
4. Confirm the test fails (red) before implementing.
5. Only then implement the feature.

Run `/new-invariant` for a guided walkthrough.
