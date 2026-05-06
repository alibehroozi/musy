---
description: Implement a new feature end-to-end with TDD discipline
---

# Implement a new feature

The user describes a feature they want built. Your job is to take it from description to "PR open and verified" with the invariant-first workflow.

## Sequence (do in order, do not skip)

1. **Confirm the scope.** Restate the feature in one sentence and confirm with the user. If it's bigger than a single PR, propose a split before proceeding. Don't push past ambiguous scope.

2. **Branch.** `git checkout -b task-<slug>` (e.g. `task-magic-link-login`).

3. **Define invariants FIRST.** Run `/new-invariant`. That command runs explore → suggest → write and stops at red stubs. Confirm `npm run test:invariants` shows the new tests as `todo` or failing — if they pass, the stubs are wrong.

4. **Implement, libs first.**
   - Pure logic → `libs/api/core/` or `libs/web/core/`
   - DB shape → `apps/api/src/modules/<name>/<name>.schema.ts` (Mongoose)
   - HTTP → `apps/api/src/modules/<name>/<name>.controller.ts`, parse with `@moc/contracts` Zod schemas
   - UI → `apps/web/src/features/<name>/`, fetch with `fetchJson` (validates with the same Zod schema)

5. **Run verify.** `npm run verify` until green. Lint, types across all workspaces, every invariant test.

6. **Manually exercise.** For UI/API features:
   - `npm run db:up && npm run dev`
   - Use the feature in the browser / via curl
   - Confirm Mongo Express (http://localhost:8181) shows the expected docs

7. **Open PR** against `main` with title `task: <short title>` and a body that lists the new invariant IDs.

## Hard rules (re-stated from AGENTS.md)

- TDD: failing tests first. If you can't make them red, the test is wrong (or the invariant is misframed — go back to `/new-invariant`).
- If a test fails during implementation, fix the **source**. Never weaken the test.
- Pure logic in libs, side effects in apps.
- No new dependencies without asking the user first.
- Never edit `.env*` files (other than `.env.example`) or `.github/workflows/*`.

## Watch out for

- **Implementing before invariants.** If you find yourself writing code without a red test, stop. Go back to step 4.
- **Drive-by changes.** A feature PR touches only what the feature requires. Refactors go in their own PRs.
- **Skipping the manual exercise.** Type-checked + green tests means correct logic, not correct user experience. For UI features, click through it before calling done.
- **Adding a new invariant section.** Categories in `INVARIANTS.md` are by constraint, never by feature. If nothing fits, the invariant is mis-phrased.
