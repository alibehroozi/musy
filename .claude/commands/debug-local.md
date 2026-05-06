---
description: Diagnose and fix a reported issue using a tiered approach (invariants → reproduce → Playwright → fix → promote)
---

# Debug a local issue

The user reports something is broken. Goal: not just fix THIS bug, but leave behind a guardrail that catches the same class of bug next time.

## Tier 0 — Reproduce in your head

Get a precise description from the user. Three questions, no skipping:

- **What did you do?** (steps, in order)
- **What did you expect?**
- **What actually happened?**

If any answer is vague ("it's broken", "it's slow", "the button is weird"), ask a follow-up. Don't proceed on hand-waves — premature debugging is wasted debugging.

## Tier 1 — Match to existing invariants

`grep INVARIANTS.md` for keywords from the report. List candidate IDs.

For each:

1. Read the test that maps to it (`tests/invariants/<category>/<file>.test.ts`).
2. Run just that test: `npx vitest run tests/invariants/<category>/<file>.test.ts`.
3. If it fails → you found the issue. **Skip to Tier 5 (fix).**

If no existing test fails, the bug is in a hole in the spec. That's important — you'll add an invariant later (Tier 6), and the bug type will inform which category.

## Tier 2 — Reproduce against the running app

Bring up the local stack:

```bash
npm run db:up
npm run dev
```

Wait for both servers to be ready:

- API: log line `[musy/api] listening on :3001`
- Web: vite ready URL

Tail the API logs in a separate process — you'll cross-reference timestamps with the browser repro in Tier 3.

If the bug is API-only (curl-reproducible), do that here and skip Tier 3.

## Tier 3 — Temporary Playwright reproduction

Write a temp test in `tests/_scratch/<bug-slug>.spec.ts`. **`tests/_scratch/` is gitignored.** Don't commit it — it gets promoted or discarded in Tier 6.

The test should:

1. Drive the browser through the user's reported steps verbatim.
2. Assert the expected outcome (so failure pins to the bug).
3. Capture: `page.on("console", ...)`, `page.on("pageerror", ...)`, and `page.on("response", ...)` so you see what's happening at every layer.
4. Run with the API logs visible.

The point is **a deterministic, runnable repro in under 5 minutes**, not a beautiful test.

> If Playwright isn't installed yet, propose adding `@playwright/test` as a devDep before proceeding. It's a known dep we're holding off until first need.

## Tier 4 — Diagnose

With a reliable repro, find the root cause. Common failure modes in this codebase, in order of frequency:

1. **Boundary validation skipped.** Controller didn't parse with the Zod schema, or fetcher didn't validate the response. Bad data slips through and surfaces somewhere downstream.
2. **Owner-scope missing on a query.** Service queries `Model.find({...})` without `userId` — leaks data or finds the wrong record. (`SEC-*` invariant gap.)
3. **Schema/contract drift.** Mongoose schema and Zod schema diverged.
4. **Async race.** A `useEffect` fires twice in StrictMode, two POSTs interleave, server response arrives after navigation.
5. **Stale data.** Browser cached old API response, in-memory cache wasn't invalidated.

For each candidate, instrument minimally (one targeted log line) before changing code. **Don't fix what you haven't diagnosed.**

## Tier 5 — Fix

Hard rules:

- **Fix the source, not the test.**
- **The fix must conform to `ARCHITECTURE.md`.** A bug that came from layering drift (HTTP in service, Mongoose in controller, business logic in component) is fixed by restoring the layering, not by patching in place.

Re-read the relevant `ARCHITECTURE.md` section before changing code. If the bug originated in a layered violation, the fix relocates code to its correct layer.

When the temp Playwright test now passes against the fix, run the full `npm run verify` to make sure no other invariant regressed. If something else turned red, you over-corrected.

Smallest possible diff that's also architecturally clean. If you find yourself rewriting a module, stop and re-scope — that's a refactor, not a fix.

## Tier 6 — Promote the repro into an invariant + commit discipline

This is the part most agents skip. Do not skip it. The fact that a real bug existed means the spec had a hole — close it before moving on.

Decide the missing invariant's category:

- Bug only visible in browser (rendering, layout, interaction) → `BROWSER-*`
- Bug expressible as failing API response or DB shape → `API-*` / `DATA-*`
- Bug in pure logic → `LOGIC-*`
- Authorization / data-leak class → `SEC-*` or `PRIVACY-*`

Now commit the fix per AGENTS.md hard rule #10 — **three commits, in order**:

### Commit 1 — `spec: add <ID> — <description>`

Run `/new-invariant`'s Phase 3 step 1 only: append the row to the matching category in `INVARIANTS.md`. Stage only `INVARIANTS.md`. Commit.

### Commit 2 — `test(<category>): <ID> regression test`

Promote the repro:

- For `BROWSER-*`: move the temp test from `tests/_scratch/` to `tests/invariants/browser/<feature>.test.ts`. Tighten its assertions to test the invariant cleanly, not just reproduce the original bug.
- For others: write the equivalent vitest/jest test in `tests/invariants/<category>/`. Discard the scratch test.

Run the new test and **confirm it fails** against the buggy code. (If it passes, your test isn't actually catching the regression.)

Stage only the test file(s). Commit.

### Commit 3+ — `fix(<scope>): <root cause>`

The actual source-code fix. One commit per layer if the fix touches multiple. Most fixes are one-layer.

Examples:

- `fix(api): scope getPlaylists query by userId`
- `fix(web): handle 401 from /me without infinite redirect loop`
- `fix(api-core): handle empty array in normalizeTasteVector`

Run `npm run verify` after the fix commit. The previously-failing test from Commit 2 now passes; everything else stays green.

## Tier 7 — PR

Before opening: did the fix change anything a fresh checkout would need (env var, docker service, port, system dep)? If yes, commit `chore(setup): update /prepare-local for <reason>` separately. Most fixes don't, but the rare ones that do silently break onboarding if missed.

Title: `fix: <short description>`

Body must include:

- The reported symptom
- The root cause (one paragraph)
- The commit sequence (`spec:` → `test:` → `fix:`)
- The new invariant ID(s) added to prevent regression
- `npm run verify` green confirmation at branch HEAD

## Hard rules

- **Three commits, in order.** `spec:` → `test:` → `fix:`. The test commit must be red against the buggy code (proof the regression test actually catches it). The fix commit makes it green.
- **Never delete a test to make a bug "go away."**
- **Always promote the repro to an invariant.** If you decide not to (e.g. one-off browser quirk), the user must approve in the chat with reasoning.
- **`tests/_scratch/` is gitignored.** Temp tests never enter version control. They get promoted (moved to `tests/invariants/...`) or discarded.

## Watch out for

- **Premature fixing.** Don't change code before you have a reproducible test. "I think I see it" is how plausible-but-wrong fixes ship.
- **Skipping log inspection.** Server logs often contain the real error message that the UI hid behind a generic "something went wrong."
- **Over-broad fixes.** Minimum diff that makes the failing test pass. Refactoring belongs in a separate PR.
- **Stopping at Tier 5.** A fix without a Tier 6 invariant is technical debt — the bug will rhyme.
