---
description: Walk the user through defining invariants for a new feature
---

# Define a new invariant

Help the user add one or more invariants for a feature they're about to build. Invariants are **guardrails** — properties that fail the moment the code drifts. Read `INVARIANTS.md` for the framing.

**Invariants are organized by what they constrain, not by which feature added them.** New features extend existing categories — they never get their own section.

**You are NOT implementing the feature.** Stop after the invariants are written and the tests are stubbed (red). The user (or their agent in a follow-up step) implements next.

## The product-property bar

Before writing any invariant, sanity-check it against this question: **would this invariant still hold, and still be testable, if the agent rewrote the feature using a different library, pattern, or function names?**

- If yes → it's a property of the product. Good invariant.
- If no → it's a unit test in disguise. The agent gets locked into one specific implementation, and the "guardrail" breaks the moment the implementation legitimately changes.

Aim for invariants that describe **observable behavior**, **rendered output**, **stored data shape**, or **HTTP contract** — not the existence or signature of a function the feature is introducing.

Naming a function is OK _only_ when it's part of the project's stable lib API (e.g. `normalizeEmail` from `@moc/api-core`). Naming a function the feature is creating (`generateMagicLink`, `embedTaste`) is not — restate the property at the product level.

## Process

1. **Ask what feature they're working on.** If unclear, point them at `TASKS.md`. Aim for 2–4 invariants per feature — fewer means the feature isn't pinned down; more usually means some are restating each other.

2. **Read `INVARIANTS.md`** to see existing IDs and the highest number in each category. New IDs continue from there.

3. **For each invariant, work with the user to answer all five questions:**
   - **What agent failure mode does this catch?** Name the specific drift — e.g. "agent stores the magic-link code in plaintext", "agent forgets to scope the query by userId and leaks another user's history". _Not_ a desired state ("the data should be safe"). If the user can't name a failure mode, push back — the invariant is too vague.

   - **State it as a falsifiable property at the product level.** Pick something that's either true or false about stored data, observable HTTP behavior, or rendered output — not about a function this feature is creating. "The system should be secure" fails; "Every magic-link code in the database has a non-null `expiresAt` strictly less than 24h from `createdAt`" passes — falsifiable, survives any rewrite.

   - **Which category?** This determines the prefix and section:
     - `DATA-*` — Mongoose document shape and integrity
     - `LOGIC-*` — pure function contracts
     - `API-*` — HTTP shape, status codes, idempotency
     - `UI-*` — DOM/jsdom-checkable rendering
     - `SEC-*` — authorization and credential hygiene
     - `PRIVACY-*` — data flow boundaries (what reaches AI prompts, third parties, telemetry)
     - `AI-*` — LLM/embedding call contracts
     - `PWA-*` — installability and offline behavior
     - `BROWSER-*` — visual/behavioral, real-browser-only

   - **Severity:** Critical (breaks the product / leaks data) or Major (degrades it).

   - **ID:** the next available number in the chosen category.

4. **Show the proposed rows to the user. Get sign-off before writing.**

5. **Append the rows to the existing `## <Category>` section in `INVARIANTS.md`.** Never create a new section. Use the existing `| ID | Invariant | Severity |` format.

6. **Stub `tests/invariants/<category>/<feature>.test.ts`** with one `describe("<ID>: <description>", ...)` block per code-checkable invariant. Each block contains an `it.todo(...)` placeholder describing the test approach. **Do not write real assertions yet** — that's the implementation step. `BROWSER-*` and `PWA-*` invariants are not stubbed in vitest; they go in the Playwright suite.

7. **Confirm the stubs are red.** Run `npm run test:invariants` and verify the new tests show as `todo` or fail. If they pass, the stub is wrong.

8. **Print a summary:** IDs added, file paths to review, and a suggested next prompt to drive implementation (e.g. "now implement DATA-02 — fill in the test body, add the Mongoose field, wire it through the service").

## Watch out for

- **Vague invariants** ("should look right", "should work"). Ask for a falsifiable form.
- **Implementation-coupled invariants.** If the invariant names a function this feature is introducing, it's a unit test. Restate at the product level.
- **Skipping the failure-mode question.** That's the whole point — it's what separates a guardrail from a wishlist.
- **Inventing a new section in `INVARIANTS.md`** ("AUTH-_", "TASTE-_"). New features extend existing categories. If nothing fits, the invariant is probably mis-phrased.
- **Forgetting `SEC-*` and `PRIVACY-*` for backend features.** A new endpoint almost always needs at least one of each. A new AI call almost always needs an `AI-*` and a `PRIVACY-*`.
- **Implementing the feature in this command.** That's the next step, not this one.
