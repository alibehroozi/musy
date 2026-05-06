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

4. **Branch.** `git checkout -b change-<slug>`.

5. **Run `/new-invariant` for new properties the change introduces.** This produces commits 1 and 2 of the sequence (spec, then test stubs).

6. **Re-read `ARCHITECTURE.md`** for the section(s) covering the touch points. Behavior changes are where layering shortcuts creep in.

7. **Implement, libs-first, one commit per layer.** Per AGENTS.md hard rule #10 — same shape as `/new-feature`:
   - `change(contracts): ...` — Zod schema updates (if shape changed)
   - `change(api-core): ...` — pure backend logic
   - `change(web-core): ...` — pure frontend logic
   - `change(api): ...` — controller / service / repository
   - `change(web): ...` — features / components / hooks

   Convert `it.todo` test bodies into real assertions in the same commit as the layer that makes them passable.

   Watch for previously-green tests turning red — that's a signal an existing invariant is now violated. Default conclusion: **your code is wrong.** Only after deliberate analysis (and user sign-off) should the conclusion be that the invariant needs updating.

8. **Run verify after the final code commit.** `npm run verify`. Both old and new invariants must be green. The HEAD of the branch must be green.

9. **Manually exercise** the changed behavior **and the surrounding feature**. Regressions in adjacent areas are the most common failure mode of change tasks. Click through related UI; hit related endpoints.

10. **Update `/prepare-local` if local-dev requirements changed.** Did this change add/modify a docker service, env var, port, or system dep? If yes, commit `chore(setup): update /prepare-local for <reason>` separately.

11. **PR title:** `change: <short description>`. PR body must list:

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
