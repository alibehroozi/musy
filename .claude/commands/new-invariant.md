---
description: Define invariants for a feature given a user description (explore first, then suggest, then write)
---

# Define new invariants

The user gives you a description of a feature they're about to build. Your job: turn that description into 2–4 falsifiable invariants, get sign-off, then write them into `INVARIANTS.md` and stub the corresponding tests.

This command runs in three phases: **explore → suggest → write.** Phases are sequential. Don't skip; don't reorder.

## Phase 1 — Explore

Before suggesting anything, ground yourself in the codebase. The user's description is the prompt; the existing code is the constraint.

1. **Read the description from the user.** If they haven't given one, ask. If it's vague ("a thing that does X"), ask for: the user-visible behavior, the steps involved, the expected result, and any edge cases or failure modes they already have in mind.

2. **Identify the domain.** What part of the system does this touch? Backend module? Frontend feature? Shared schema? Auth? AI prompt path? Cross-cutting?

3. **Read the relevant code.**
   - Backend feature → skim `apps/api/src/modules/<related>/`, the matching Mongoose schemas, and any existing controllers in adjacent domains
   - Frontend feature → skim `apps/web/src/features/<related>/` and the corresponding `libs/web/core/`
   - Shared logic → skim `libs/shared/contracts/` and `libs/api/core/`
   - **Always** scan `INVARIANTS.md` for the highest IDs in each category and any rules in adjacent domains
   - Goal: know what already exists so suggestions don't duplicate, contradict, or skip the obvious extension of an existing rule

4. **Note your findings briefly** (3–5 bullets, scannable):
   - Existing related invariants
   - Existing related code paths
   - Patterns the project already follows that this feature should mirror
   - Conflicts or ambiguities — flag now, before drafting

If the exploration reveals that the user's description is ambiguous given the existing code, **stop and ask** before drafting. Don't fabricate intent.

## Phase 2 — Suggest

Draft 2–4 candidate invariants. **Show them to the user. Get explicit sign-off before writing anything.**

For each candidate, present:

| Field               | Content                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| Proposed ID         | Next available in the chosen category (e.g. `DATA-02`, `SEC-01`)                                   |
| Text                | Falsifiable property — what's true or false about stored data, observable HTTP, or rendered output |
| Category            | `DATA` / `LOGIC` / `API` / `UI` / `SEC` / `PRIVACY` / `AI` / `PWA` / `BROWSER`                     |
| Severity            | `Critical` (breaks the product / leaks data) or `Major` (degrades it)                              |
| Failure mode caught | The specific agent drift this catches (e.g. "agent stores the magic-link code in plaintext")       |
| Why this category   | One sentence on why it's `DATA-` not `LOGIC-`, etc.                                                |

The product-property bar applies to every candidate:

> Would this invariant still hold, and still be testable, if the agent rewrote the feature using a different library, pattern, or function names?

If no → it's a unit test in disguise. Restate it at the level of stored data, observable behavior, or rendered output. Naming a function that **the feature itself is creating** is not allowed; naming a function from the project's stable lib API (`normalizeEmail`, `fetchJson`) is fine.

After presenting, **stop and wait.** Three responses to handle:

- **Approval** → continue to Phase 3.
- **Refinement** ("tighten DATA-02", "drop API-03", "add one for X") → revise and re-present. Loop until approved.
- **Question** → answer, don't act.

Aim for 2–4 invariants. Fewer means the feature isn't pinned down; more usually means some are restating each other.

## Phase 3 — Write

Only enter Phase 3 **after** explicit user approval of the candidate set.

1. **Append the rows** to the existing `## <Category>` sections in `INVARIANTS.md`. Use the existing `| ID | Invariant | Severity |` format. **Never create a new per-feature section.**

2. **Stub the tests** in `tests/invariants/<category>/<feature>.test.ts` with one `describe("<ID>: <description>", ...)` block per code-checkable invariant. Each block contains an `it.todo(...)` placeholder describing the test approach. **Do not write real assertions yet** — that's the implementation step (`/new-feature` handles that). `BROWSER-*` and `PWA-*` invariants are not stubbed in vitest; they belong in the Playwright suite.

3. **Confirm red.** Run `npm run test:invariants`. Verify the new tests show as `todo` or fail. If they pass, the stub is wrong — fix and re-run.

4. **Print a tight summary:**
   - IDs added
   - File paths to review (`INVARIANTS.md` rows, test stub paths)
   - Suggested next prompt: `/new-feature` to drive implementation

## Hard rules

- **Three phases, in order.** No suggesting before exploring; no writing before approval.
- **Don't implement the feature.** That's `/new-feature`. This command stops at red stubs.
- **Don't invent a new section in `INVARIANTS.md`.** Categories are by constraint, never by feature. If nothing fits, the invariant is mis-phrased — restate it.
- **Don't fabricate intent.** Ambiguous description → ask. Do not guess and proceed.

## Watch out for

- **Suggesting before exploring.** Skipping Phase 1 produces invariants that duplicate existing rules or miss obvious extensions of them.
- **Vague invariants** ("should look right", "should work"). Falsifiable form only.
- **Implementation-coupled invariants.** Naming a function the feature is creating = unit test. Restate at product level.
- **Skipping the failure-mode column.** Every candidate must name a specific agent drift it catches. Otherwise it's a wishlist item, not a guardrail.
- **Forgetting `SEC-*` and `PRIVACY-*` for backend features.** A new endpoint almost always needs at least one. New AI calls almost always need both an `AI-*` and a `PRIVACY-*`.
