---
description: Implement a new feature end-to-end with TDD discipline
---

# Implement a new feature

The user describes a feature they want built. Your job is to take it from description to "PR open and verified" with the invariant-first workflow.

## Sequence (do in order, do not skip)

1. **Confirm the scope.** Restate the feature in one sentence and confirm with the user. If it's bigger than a single PR, propose a split before proceeding. Don't push past ambiguous scope.

2. **Tooling check (terse).** Before branching:
   - List capabilities this feature needs that the codebase doesn't already cover (auth? email? rate-limit? embeddings? caching? scheduling?)
   - For each new capability: 2–3 **open-source** candidates + your recommendation. **One short reason each. Bullet list only. No paragraphs.**
   - Open-source first; propose paid/proprietary only when open-source options are clearly worse — and say why
   - "No new packages — using `<existing>`" is a valid output and the most common one
   - **Stop and wait for user approval** before adding any dep

   Example output shape:

   ```
   - magic-link tokens: lucia (recommended — TS-native, small) | passport-magic-login | roll-own
   - email send: nodemailer (recommended — std, ESM-friendly) | resend SDK | postmark SDK
   Approve?
   ```

3. **Design system check (web features only).** Read [`DESIGN.md`](../../DESIGN.md). For each UI element this feature needs (button, tooltip, input, modal, …), check the catalog. If anything is missing:
   - Stop and tell the user: _"`<Component>` is identified as a design-system component and is missing from the catalog. Add it to the design system first?"_
   - On approval, run `/design-system` to land the missing piece(s) as their own commits **before** continuing this command. Each missing component becomes its own `feat(design-system, <name>): …` commit.
   - On rejection, you must surface why a one-off in `apps/web/` is acceptable here. Default is to add to the DS — one-off UI inside `apps/web/` is the smell, not the shortcut.
   - Skip this step entirely for backend-only features.

4. **Branch.** `git checkout -b task-<slug>` (e.g. `task-magic-link-login`).

5. **Define invariants FIRST.** Run `/new-invariant`. That command runs explore → suggest → write and stops at red stubs. Confirm `npm run test:invariants` shows the new tests as `todo` or failing — if they pass, the stubs are wrong.

6. **Re-read `ARCHITECTURE.md`** for the section(s) relevant to where you're about to write code (apps/api, apps/web, the relevant lib). The implementation must conform — controller/service/repository layering on the api side, component sizing / hook / context rules on the web side, allowed-deps boundary on libs.

7. **Implement libs-first, one commit per layer.** Per AGENTS.md hard rule #10, each layer that's touched is its own commit. Empty layers are skipped.

   Order, with conventional commit message prefix in parens:
   - **`feat(contracts): ...`** — Zod schemas in `libs/shared/contracts/`. Both BE and FE will import these.
   - **`feat(api-core): ...`** — pure backend logic in `libs/api/core/` (validators, transformers). No NestJS / Mongoose imports.
   - **`feat(web-core): ...`** — pure frontend logic in `libs/web/core/`. No React / DOM imports.
   - **`feat(api): ...`** — `apps/api/src/modules/<name>/` with module + controller + service + repository + schema. Per `ARCHITECTURE.md` layering.
   - **`feat(web): ...`** — `apps/web/src/features/<name>/` with `<Name>Page.tsx`, subcomponents in `components/`, hooks in `hooks/`, fetcher in `api.ts`. Components used must already exist in `@moc/design-system` (caught by step 3).

   **Convert `it.todo` test bodies into real assertions in the same commit as the layer that makes them passable.** Tests that depend on `contracts` get real bodies in the `feat(contracts):` commit. Tests that depend on `api` get real bodies in the `feat(api):` commit. By the final code commit, every test is green.

8. **Run verify** after each layer commit. `npm run verify` doesn't have to pass on every intermediate commit (test commits often run red against missing implementation), but **the final commit on the branch must be green**.

9. **Manually exercise.** For UI/API features:
   - `npm run db:up && npm run dev`
   - Use the feature in the browser / via curl
   - Confirm Mongo Express (http://localhost:8181) shows the expected docs

10. **Update `/prepare-local` if local-dev requirements changed.** Did this feature add a new docker service, a new required env var, a new system dep, a new port, or a new init step? If yes, commit `chore(setup): update /prepare-local for <reason>` separately. If no, skip.

11. **Open PR** against `main` with title `task: <short title>`. Body lists:

- The commit sequence (spec → test → code by layer)
- The new invariant IDs
- Confirmation final commit is `npm run verify` green

## Hard rules (re-stated from AGENTS.md)

- **Micro-commits in order.** spec (via `/new-invariant` commit 1) → test stubs (via `/new-invariant` commit 2) → implementation by layer. Never bundle layers; never bundle test+code in the same commit unless they're truly inseparable.
- **Conform to `ARCHITECTURE.md`.** Layering, file roles, "when to use what" — non-negotiable.
- TDD: failing tests first. If you can't make them red, the test is wrong (or the invariant is misframed — go back to `/new-invariant`).
- If a test fails during implementation, fix the **source**. Never weaken the test.
- Pure logic in libs, side effects in apps.
- No new dependencies without asking the user first.
- Never edit `.env*` files (other than `.env.example`) or `.github/workflows/*`.

## Watch out for

- **Skipping step 2 (tooling check).** Asking the user about packages mid-implementation is too late — propose options upfront, terse and bullet-listed, and wait for sign-off before adding deps.
- **Skipping step 3 (design-system check).** Hand-rolling buttons / tooltips / inputs into `apps/web/` instead of `@moc/design-system` is the most common drift. Always check the catalog first.
- **Skipping step 6 (re-read ARCHITECTURE.md).** Most architectural drift comes from agents going on muscle-memory instead of checking the project's specific layering rules.
- **Implementing before invariants.** If you find yourself writing code without a red test, stop. Go back to step 5.
- **Drive-by changes.** A feature PR touches only what the feature requires. Refactors go in their own PRs.
- **Skipping the manual exercise.** Type-checked + green tests means correct logic, not correct user experience. For UI features, click through it before calling done.
- **Adding a new invariant section.** Categories in `INVARIANTS.md` are by constraint, never by feature. If nothing fits, the invariant is mis-phrased.
- **Putting business logic in the controller, or HTTP in the service.** Re-check the layering table in `ARCHITECTURE.md` — every Nest file has exactly one role.
- **Components creeping past their size cap, or contextifying single-subtree state.** Same — re-check the React rules in `ARCHITECTURE.md`.
