---
description: Implement a new feature end-to-end with TDD discipline
---

# Implement a new feature

The user has named a feature (or pointed at one in `TASKS.md`). Your job is to take it from "selected" to "PR open and verified" with the invariant-first workflow.

This is the **user-driven** version of `/pick-task` — the task is given, not autonomously chosen.

## Sequence (do in order, do not skip)

1. **Confirm the scope.** Restate the feature in one sentence and confirm with the user. If it's bigger than a single PR, propose a split before proceeding. Don't push past ambiguous scope.

2. **Branch.** `git checkout -b task-<id>-<slug>` (e.g. `task-auth-01-magic-link`).

3. **Update `TASKS.md`.** Move the row from **Ready** to **In progress** with the branch name.

4. **Define invariants FIRST.** Run `/new-invariant`. Stop until invariants are written and tests stubbed. Confirm `npm run test:invariants` shows the new tests as `todo` or failing — if they pass, the stubs are wrong.

5. **Implement, libs first.**
   - Pure logic → `libs/api/core/` or `libs/web/core/`
   - DB shape → `apps/api/src/modules/<name>/<name>.schema.ts` (Mongoose)
   - HTTP → `apps/api/src/modules/<name>/<name>.controller.ts`, parse with `@moc/contracts` Zod schemas
   - UI → `apps/web/src/features/<name>/`, fetch with `fetchJson` (validates with the same Zod schema)

6. **Run verify.** `npm run verify` until green. Lint, types across all workspaces, every invariant test.

7. **Manually exercise.** For UI/API features:
   - `npm run db:up && npm run dev`
   - Use the feature in the browser / via curl
   - Confirm Mongo Express (http://localhost:8181) shows the expected docs

8. **Update `TASKS.md`.** Move to **Done (recent)** with the PR link once opened. Trim that section to the last ~10.

9. **Open PR** against `main` with title `task: <ID> <short title>`.

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
