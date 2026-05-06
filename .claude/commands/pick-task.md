---
description: Pick the next task from TASKS.md and start the invariant-first workflow
---

# Pick the next task

Used by the daily auto-PR loop and any session that asks "what's next?".

## Steps

1. Read `TASKS.md`. Pick the **top item under Ready** that is single-PR sized.
2. If the top item is too large or ambiguous, split it. Update `TASKS.md` with the new shape and stop — ask the user to confirm before picking.
3. Move the chosen task from **Ready** to **In progress** with a branch name: `task-<id>-<slug>` (e.g. `task-auth-01-magic-link`).
4. Create the branch: `git checkout -b task-<id>-<slug>`
5. Run `/new-invariant` to define invariants for this task **before any implementation**.
6. Confirm the new invariant tests are red (`npm run test:invariants`).
7. Implement: pure logic in `libs/`, then wire `apps/`.
8. Run `npm run verify` until green.
9. Commit with `task: <ID> <short title>` and open a PR against main.

## Hard rules (re-stated from AGENTS.md)

- **Do not edit `INVARIANTS.md` outside `/new-invariant`.**
- **Do not weaken a failing test.** Fix the source.
- **Do not add dependencies** without explicit approval — propose first.
- **Do not touch `.env*` files** other than `.env.example`.

## Output

Print the picked task ID, the branch name, and the next concrete command for the user to run (`/new-invariant`).
