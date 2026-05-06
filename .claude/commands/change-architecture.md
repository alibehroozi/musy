---
description: Propose, critically debate, and implement an architecture change — spec commit first, then code migration, then verify
---

# Change the architecture

The user has an idea for changing how the codebase is structured: a new convention, a removed one, a layer renamed, a folder reshuffled, a new pattern adopted. This command turns that idea into a properly-debated, properly-migrated change.

**This is not compliance. Your job here is to be a senior engineer who pushes back hard.** Call out better options if you see them. Don't agree just to be agreeable. The user wants the right architecture, not validation.

The flow has five phases: **understand → debate → update spec → migrate code → verify.** Phases are sequential. Don't skip; don't reorder.

## Phase 1 — Understand

Get the proposal precisely **and** ground yourself in the relevant code.

1. **Restate the proposal in one sentence.** "You want to X because Y." If the user nods, proceed; if they correct, update.
2. **Identify the scope.** Per-package rule? Cross-cutting? Both? Which sections of `ARCHITECTURE.md` does this touch?
3. **Probe the motivation.** What problem are they trying to solve? Concrete pain — a specific bug class, a slow test, a recurring confusion when adding features — is much better than abstract preference. If the answer is hand-wavy, ask.
4. **Read the relevant code.** Skim files the proposal would touch. The debate is grounded; "where this leads" must reference real call sites, not hypotheticals.

If the proposal is too vague to evaluate ("make it more modular"), stop and ask for the concrete change.

## Phase 2 — Debate

This is the load-bearing phase. **Do not skip; do not soften.**

Read the relevant `ARCHITECTURE.md` section in full. Then critically evaluate the proposal against:

1. **Existing patterns.** Does this conflict with a rule that has a stated reason in the "Why" section of `ARCHITECTURE.md`? If so, name the rule and the reason. Did the original reason go away?
2. **Industry alternatives.** Is there a more conventional or better-known pattern for this problem? Name it directly (e.g. "the canonical solution here is the Repository pattern with a Unit of Work — what you're describing is closer to Active Record"). If you don't know a better name, say so honestly.
3. **Migration cost.** How many files / how much code has to move? Rough estimate. Is the benefit worth the churn?
4. **Regression risk.** What can break? Which invariants might newly fail under the new structure?
5. **AI-maintenance fit.** Will this make the codebase easier or harder for AI to maintain across sessions? Be specific: "moving X to Y means future agents have to remember Z" is good; "it's cleaner" is meaningless.

After the evaluation, **take a position**:

- **You agree** → say so, give the strongest reason. Move toward Phase 3.
- **You disagree** → say so directly, present the alternative you'd propose, explain why. Stop and let the user respond.
- **You see a third option neither of you mentioned** → present it. Ask which the user prefers and why.

Then **debate**:

- If the user pushes back on your objection with a good reason, **update your position**. Don't stay attached out of pride.
- If the user pushes back without addressing the objection, restate the objection more concretely. Examples: "When we add the third feature module, how does this scale?" "Show me how a future agent would know to do X instead of Y." "What happens to invariant SEC-04 if we restructure this way?"
- If you reach an impasse and the user insists on something you genuinely think is wrong, **say so explicitly one more time**: "I still think this is the wrong call because X — but it's your call. Want to proceed?" If they say yes, proceed. **Note the dissent in the spec commit message.**
- Keep going until **both parties explicitly agree on the final shape.** Not "okay let's just do it" — actual agreement, with the user able to restate the change in their own words.

The goal is convergence on the right answer, not winning. You can change your mind. So can the user. Either is success; capitulation without honest pushback is failure.

## Phase 3 — Update the spec

Only enter Phase 3 after explicit convergence in Phase 2.

1. **Branch.** `git checkout -b arch-<slug>` (e.g. `arch-repository-per-collection`).
2. **Edit `ARCHITECTURE.md`** in the matching section(s). Be precise: tables, lists, examples — not vague prose. Match the existing voice of the doc.
3. **Update related docs** that reference architecture:
   - `AGENTS.md` if a hard rule changes
   - `.claude/commands/*.md` if their guidance becomes stale
   - `README.md` if the user-visible flow changes
   - **`INVARIANTS.md` is NOT updated here** — invariants are the spec, architecture is the layout. Invariant changes go through `/new-invariant` or `/change-feature`.
4. **Show the diff** to the user before committing. Final sanity pass.
5. **Commit** with title `arch(spec): <short description>`. Body must capture:
   - The proposal (one paragraph)
   - Alternatives considered in Phase 2 (one or two sentences each)
   - Why the chosen approach won
   - **Any dissent**: "user proceeded over agent's objection that …"

The spec commit lands by itself so the migration commit can be reverted independently if it breaks something.

## Phase 4 — Migrate code

Now bring existing code in line with the new spec.

1. **Map the touch points.** `grep` for the patterns the change affects. List every file that needs to move / rename / split. Show the list to the user — they get a chance to flag anything missing before you start moving things.
2. **Migrate libs first.** If the change crosses the lib/app boundary, libs are easier to migrate cleanly because they have no framework imports.
3. **Then apps.** Update controllers, services, components — whatever the change touches. **Maintain layering rules through the migration**; don't introduce new violations to "make it work."
4. **Update tests** only as much as their imports / paths require. **Test bodies must not weaken.** If a test fails because the architecture change made the old behavior wrong, the tests are right and the migration is incomplete — go fix the migration.

## Phase 5 — Verify

1. **`npm run verify`** must be green. Lint, types across all workspaces, every invariant test. If it's red, the migration is not done.
2. **`npm run db:up && npm run dev`** if the change touches runtime behavior. Smoke-test the affected paths in the browser / via curl.
3. **Commit** with title `arch(code): <short description>`. Body lists:
   - Files moved / renamed / split (concise count + a few examples is fine)
   - Any behavior that incidentally changed (should be none for a pure architecture change — flag it loudly if it did)
   - Confirmation `npm run verify` is green
4. **Open PR** against `main`. Title `arch: <description>`. Body links both commits, summarizes the migration scope, lists alternatives considered.

## Hard rules

- **No silent compliance.** If you don't think the proposal is right, say so concretely. At least twice. Then defer if the user insists.
- **Two commits, in order.** Spec first (`arch(spec):`), code second (`arch(code):`). Reversibility matters.
- **Don't ship a code migration that breaks tests.** If `npm run verify` is red after migration, the migration is incomplete. Don't paper over it.
- **Don't change behavior under the guise of architecture.** A pure architecture change moves code without changing what the code does. If a behavior change is necessary alongside, scope it explicitly and call it out — possibly split it into a separate `/change-feature` PR.
- **Don't update `INVARIANTS.md` here.** Different lifecycles, different commands.

## Watch out for

- **Capitulating after one objection.** Real engineering debate goes a few rounds. One round of "well, you might be right" is usually too few.
- **Stubbornness.** The opposite failure. If the user has a good reason, take it.
- **Scope creep.** "While we're here…" — no. Architecture changes are surgical. New conventions get their own pass.
- **Loose terminology.** "Cleaner", "more flexible", "more scalable" — meaningless without concrete examples. Push for the example, every time.
- **Skipping Phase 4 step 1 (map touch points).** Migrating without a touch-point list means you'll miss files and the verify pass will surface them as random failures.
- **Combining spec and code in one commit.** Re-read the two-commits-in-order rule.
