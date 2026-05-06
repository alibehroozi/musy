---
description: Implement a new feature end-to-end with TDD discipline
---

# Implement a new feature

The user describes a feature they want built. Your job is to take it from description to "PR open and verified" with the invariant-first workflow.

## Sequence (do in order, do not skip)

1. **Confirm the scope.** Restate the feature in one sentence and confirm with the user. If it's bigger than a single PR, propose a split before proceeding. Don't push past ambiguous scope.

2. **Branch.** `git checkout -b task-<slug>` (e.g. `task-magic-link-login`).

3. **Define invariants FIRST.** Run `/new-invariant`. That command runs explore → suggest → write and stops at red stubs. Confirm `npm run test:invariants` shows the new tests as `todo` or failing — if they pass, the stubs are wrong.

4. **Re-read `ARCHITECTURE.md`** for the section(s) relevant to where you're about to write code (apps/api, apps/web, the relevant lib). The implementation must conform — controller/service/repository layering on the api side, component sizing / hook / context rules on the web side, allowed-deps boundary on libs.

5. **Implement, libs first.** Following `ARCHITECTURE.md`:
   - Pure logic → `libs/api/core/` or `libs/web/core/` (no NestJS / React imports here)
   - Wire format → Zod schemas in `libs/shared/contracts/`
   - DB shape → `apps/api/src/modules/<name>/<name>.schema.ts` (one collection per file)
   - HTTP → `apps/api/src/modules/<name>/<name>.controller.ts` (HTTP only — no business logic)
   - Business rules → `apps/api/src/modules/<name>/<name>.service.ts` (no HTTP, no Mongoose)
   - DB access → `apps/api/src/modules/<name>/<name>.repository.ts` (only place that imports `Model<T>`)
   - UI → `apps/web/src/features/<name>/` with the page in `<Name>Page.tsx`, subcomponents under `components/`, hooks under `hooks/`, fetchers in `api.ts`

6. **Run verify.** `npm run verify` until green. Lint, types across all workspaces, every invariant test.

7. **Manually exercise.** For UI/API features:
   - `npm run db:up && npm run dev`
   - Use the feature in the browser / via curl
   - Confirm Mongo Express (http://localhost:8181) shows the expected docs

8. **Update `/prepare-local` if local-dev requirements changed.** Did this feature add a new docker service, a new required env var, a new system dep, a new port, or a new init step? If yes, update `.claude/commands/prepare-local.md` so a fresh checkout still works. If no, skip.

9. **Open PR** against `main` with title `task: <short title>` and a body that lists the new invariant IDs.

## Hard rules (re-stated from AGENTS.md)

- **Conform to `ARCHITECTURE.md`.** Layering, file roles, "when to use what" — non-negotiable.
- TDD: failing tests first. If you can't make them red, the test is wrong (or the invariant is misframed — go back to `/new-invariant`).
- If a test fails during implementation, fix the **source**. Never weaken the test.
- Pure logic in libs, side effects in apps.
- No new dependencies without asking the user first.
- Never edit `.env*` files (other than `.env.example`) or `.github/workflows/*`.

## Watch out for

- **Skipping step 4 (re-read ARCHITECTURE.md).** Most architectural drift comes from agents going on muscle-memory instead of checking the project's specific layering rules.
- **Implementing before invariants.** If you find yourself writing code without a red test, stop. Go back to step 3.
- **Drive-by changes.** A feature PR touches only what the feature requires. Refactors go in their own PRs.
- **Skipping the manual exercise.** Type-checked + green tests means correct logic, not correct user experience. For UI features, click through it before calling done.
- **Adding a new invariant section.** Categories in `INVARIANTS.md` are by constraint, never by feature. If nothing fits, the invariant is mis-phrased.
- **Putting business logic in the controller, or HTTP in the service.** Re-check the layering table in `ARCHITECTURE.md` — every Nest file has exactly one role.
- **Components creeping past their size cap, or contextifying single-subtree state.** Same — re-check the React rules in `ARCHITECTURE.md`.
