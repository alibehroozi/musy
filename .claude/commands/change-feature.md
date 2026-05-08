---
description: Modify behavior of an existing feature with invariants kept in sync
---

# Change an existing feature

Behavior changes are riskier than greenfield work — the feature already has invariants, and changing it can either tighten, replace, or invalidate them. Walk this carefully.

If the user says "X is broken," that's `/debug-local`, not this command. This command is for **deliberate** behavior changes.

## Sequence

1. **Pin down the change.** Get a one-sentence description from the user of what behavior is shifting. Restate it back. If they push back or refine, capture the refined version. Don't proceed on vague.

2. **Find the touch points.** `grep` the feature's identifiers across:
   - `INVARIANTS.md` — which IDs name this feature's data, logic, HTTP shape, UI?
   - Source — which files implement it?
   - Tests — which invariant tests cover it?

3. **Audit existing invariants.** For each ID found, decide:
   - **Still holds** → leave alone. The rule is still part of the spec.
   - **Should tighten** → propose updated text + severity. Run `/new-invariant` to add the tighter version (which produces its own 2 commits). Generally **add** rather than edit existing rows in place.
   - **No longer applies** → flag to user with the row text and proposed reason. **Removal requires explicit user approval in the chat.** Never silently delete a row.

4. **Tooling check (only if the change introduces a capability the codebase doesn't already cover).** Most behavior changes don't need new packages — say "no new packages — using `<existing>`" and skip. Otherwise:
   - 2–3 **open-source** candidates per new capability + your recommendation. **One short reason each. Bullet list only. No paragraphs.**
   - Open-source first; propose paid/proprietary only when open-source options are clearly worse — and say why
   - **Stop and wait for user approval** before adding any dep

4.5. **Design system check (web changes only).** If the change introduces or modifies UI elements, read [`DESIGN.md`](../../DESIGN.md) and check the catalog. Missing component → run `/design-system` first. Missing variant on an existing component → also `/design-system`. Skip for backend-only changes.

5. **Branch.** `git checkout -b change-<slug>`.

6. **Run `/new-invariant` for new properties the change introduces.** This produces commits 1 and 2 of the sequence (spec, then test stubs).

7. **Re-read `ARCHITECTURE.md`** for the section(s) covering the touch points. Behavior changes are where layering shortcuts creep in.

8. **Implement, libs-first, one commit per layer.** Per AGENTS.md hard rule #10 — same shape as `/new-feature`:
   - `change(contracts): ...` — Zod schema updates (if shape changed)
   - `change(api-core): ...` — pure backend logic
   - `change(web-core): ...` — pure frontend logic
   - `change(api): ...` — controller / service / repository
   - `change(web): ...` — features / components / hooks
   - `change(visual, web): ...` — when the change touches user-visible behavior, update `apps/web/tests/e2e/<feature-slug>.spec.ts`. **New behavior path** → add a new `test()` with the relevant `getBy*` interactions and a `toHaveScreenshot('<feature>-<state>.png')`. **Removed path** → delete the obsolete `test()` and run `npm run test:visual:web:update` to drop its orphan baseline PNG. **Adjusted path** → the existing test stays; only the snapshot's PNG regenerates (baseline change is the visible-change evidence). See `/new-feature` step 7a for the authoring pattern. **Specs always import from `./fixtures.js`** (auth is mocked universally there); `test.use({ authed: false })` opts a describe block out for sign-in / unauth UX.

   Convert `it.todo` test bodies into real assertions in the same commit as the layer that makes them passable.

   Watch for previously-green tests turning red — that's a signal an existing invariant is now violated. Default conclusion: **your code is wrong.** Only after deliberate analysis (and user sign-off) should the conclusion be that the invariant needs updating.

9. **Run verify after the final code commit.** `npm run verify`. Both old and new invariants must be green. The HEAD of the branch must be green.

10. **Manually exercise** the changed behavior **and the surrounding feature**. Regressions in adjacent areas are the most common failure mode of change tasks. Click through related UI; hit related endpoints.

11. **Cascade env / local-dev changes (per AGENTS.md hard rule #9).** Did this change add, rename, change the meaning of, or remove an environment variable? Add / change a docker service, port, system dep, or init step? If yes, the change ripples to **all four** of:
    - `apps/<api|web>/.env.example` — add / rename / remove with a one-line comment
    - `.claude/commands/prepare-local.md` — Step 3 (owned-keys, fresh-write template, validation, summary), Step 4 / 5 if service / port / URL changed
    - `.github/workflows/auto-feature.yml` — "Seed CI .env.local files" heredoc
    - `.github/workflows/claude-respond.yml` — same seed step

    Land in one `chore(setup): cascade <var-or-thing> across env files + workflows` commit (or split per-file if large). Forgetting any of the four breaks either local dev or CI. If no env / local-dev change, skip.

12. **PR title:** `change: <short description>`. PR body must list:

- Invariants added (with IDs and text)
- Invariants tightened (with IDs and old → new)
- Invariants removed (with link/quote of user approval)
- What you manually exercised

## Hard rules

- **Micro-commits in order.** spec (via `/new-invariant`) → test stubs → implementation by layer. Same discipline as `/new-feature`.
- **Conform to `ARCHITECTURE.md`.** The change must respect the project's layering and per-package rules.
- **Removing an invariant requires explicit user approval in the chat.** The rule is the spec — losing it is losing a guardrail.
- If a previously-passing test now fails because of your change, the default is that **your code is wrong**.
- Never edit existing invariant text "to make it pass." Add a new invariant if the property genuinely changed; never weaken an existing one.

## Watch out for

- **Drive-by deletion of invariants.** "This invariant doesn't fit anymore" is sometimes true, but more often the invariant was always right and your change is over-broad.
- **Adjacent-feature regressions.** Always run the full `npm run verify`, not just the file you changed.
- **Silent semantic shifts.** If the invariant's text didn't change but its meaning did (e.g. a referenced function now does something different), that's still a spec change — flag it.
