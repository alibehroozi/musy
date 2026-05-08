---
description: Add or change a design-system token or component (libs/web/design-system)
---

# Design system

The user wants to add or change something in the design system — a new component, a new variant on an existing one, a new token, a behavior tweak. Treat this like `/new-feature` scoped to `libs/web/design-system`.

Read [`DESIGN.md`](../../DESIGN.md) for the catalog and token reference, and the **`libs/web/design-system`** section of [`ARCHITECTURE.md`](../../ARCHITECTURE.md) for the package rules.

## Sequence

1. **Confirm the scope.** Restate what's being added/changed in one sentence.
   - "Add a `Tooltip` component with `top` / `bottom` / `left` / `right` placements."
   - "Add a `loading` state to `Button`."
   - "Add a `--color-info` token + utility."
     If the user is vague ("make it look better"), push back for the concrete change.

2. **Tooling check (terse).** Same shape as `/new-feature` step 2:
   - List any capability the feature needs that the package doesn't already cover (positioning library for tooltips, focus-trap for modals, slot pattern for `asChild`, etc.)
   - 2–3 **open-source** candidates per new capability + your recommendation. **One short reason each. Bullet list only.**
   - Open-source first; propose paid/proprietary only when open-source options are clearly worse — and say why
   - "No new packages — using `<existing>`" is a valid output and the most common one
   - **Stop and wait for user approval** before adding any dep

3. **Branch.** `git checkout -b ds-<slug>` (e.g. `ds-tooltip`, `ds-button-loading`).

4. **Re-read the design-system rules** in `ARCHITECTURE.md` — tokens-only, no app imports, stories mandatory, small API surface.

5. **Implement, micro-commits per AGENTS.md hard rule #10.** Order:
   - **Tokens first** if any are new. `feat(design-system, tokens): add --color-info` — edits `libs/web/design-system/src/styles/theme.css` and the token table in `DESIGN.md`. **Tokens always land in their own commit.**
   - **Component**. `feat(design-system, <name>): add <Name>` (or `change(design-system, <name>): …` for a change). One commit covers the component file, its test, and its story — they're tightly coupled and meaningless apart.
   - **Catalog**. `docs(design-system): add <Name> to DESIGN.md catalog` — only when the component is new (not for variant changes on existing components).

   **Note on visual regression:** DS components do **NOT** need Playwright specs. Lost Pixel automatically snapshots every Ladle story across the configured breakpoints — your component + story already constitute the visual test. New / changed component → new / changed `<Name>.stories.tsx` → Lost Pixel snaps it on the next `verify:visual` run. Apply the regenerate-vs-fix decision tree (AGENTS.md hard rule #12) when those snapshots fail.

6. **Run verify — both flavors. Visual is mandatory for every DS change.**
   - `npm --workspace libs/web/design-system run test` for component tests
   - `npm --workspace libs/web/design-system run stories` to eyeball the story locally — at least skim each variant
   - `npm run verify` at the root must be green at the branch HEAD (Layer 1 + 2)
   - `npm run verify:visual` — runs both `test:visual:ds` (Lost Pixel against Ladle stories) **and** `test:visual:web` (Playwright snapshots of apps/web pages). DS changes routinely cascade into apps/web — a token tweak or component restyling shifts every page that consumes it — so checking only the DS half lets app-level regressions through. **Always run the full `verify:visual`, never just `test:visual:ds`.**
   - **First-run / regenerate flow:** if a snapshot fails, apply the regenerate-vs-fix decision tree (AGENTS.md hard rule #12). When the diff is intended, **never run a workspace-wide `:update`** — it overwrites every drifted baseline at once, silently making any unrelated regression the new "correct." Target only what this change actually touched:
     - **Web-side (Playwright, `apps/web/`).** The script is `playwright test --update-snapshots`; npm passes args through. Update only specs that exercise the changed DS component:

       ```bash
       npm --workspace apps/web run test:visual:update -- tests/e2e/<spec>.spec.ts
       ```

       Append `-g "<test title>"` to scope further inside one spec.

     - **DS-side (Lost Pixel, `libs/web/design-system/`).** The CLI has no per-story filter, so do a surgical PNG copy:

       ```bash
       # 1. Compare. Even on failure, current/ and difference/ are populated.
       npm run test:visual:ds || true

       # 2. Inspect what diffed:
       ls libs/web/design-system/.lostpixel/difference/

       # 3. Classify each entry as one of:
       #    (a) new story authored by this DS change,
       #    (b) existing story whose visual change is intended by this DS change,
       #    (c) unrelated drift — STOP, fix the source code instead.

       # 4. For (a) and (b) only, copy that one story's PNGs (one per breakpoint
       #    matches via the wildcard — the literal `[w375px]` etc. is matched by *):
       cp libs/web/design-system/.lostpixel/current/<story>--<variant>__*.png \
          libs/web/design-system/.lostpixel/baseline/

       # 5. Re-run compare to confirm green.
       npm run test:visual:ds
       ```

     - Commit the new / updated PNGs as `feat(visual): regenerate baselines for <Name>`. The PR diff shows exactly the baselines you intentionally rewrote — no others.

   - Re-run `npm run verify:visual` after regenerating to confirm green.

7. **Update `/prepare-local` if local-dev requirements changed.** New devDeps that the design-system package needs (e.g. a Radix primitive) should be added to its package.json — `/prepare-local` itself usually doesn't need an update. If you added a new npm script the agent should run automatically, document it.

8. **Open PR** against `main` with title `ds: <short description>`. Body lists:
   - The component (or token) added/changed
   - The commit sequence
   - Any new dep, with the alternatives you considered
   - Confirmation `npm run verify` **and** `npm run verify:visual` are both green at branch HEAD

## Hard rules

- **Tokens-only.** Component code never hard-codes colors, pixel values, or typography sizes. If a value isn't in the token set, add the token in its own commit first, then use it.
- **No app imports.** The design system depends on React + Tailwind + occasional headless primitives (Radix, Floating UI) only. It must build standalone — Ladle confirms this.
- **Story mandatory.** Every new component or variant has a Ladle story. A component without a `<Name>.stories.tsx` isn't done.
- **Small API surface.** Variants are semantic (`primary` | `secondary` | `ghost`), not raw style props. Don't add `colorOverride` / `customRadius` / etc. — that's a token gap, fix tokens.
- **Same micro-commit discipline as everything else.** Tokens → component+test+story → catalog. Don't bundle.
- **`verify:visual` is non-negotiable.** Every `/design-system` PR must show `npm run verify:visual` green at HEAD. The DS-only check (`test:visual:ds`) is not enough — it misses app-level regressions when a token or shared component shifts. No exceptions, even for "tiny" tweaks.

## Watch out for

- **Forgetting tokens.** Components shouldn't introduce arbitrary values. Adding `bg-[#abcdef]` is the warning sign — stop and add a token.
- **Re-implementing components in `apps/web`.** If `/new-feature` finds a component missing here, that's a `/design-system` task first, not a "I'll just inline it" task.
- **Skipping the story.** Easy to skip; reviewers and the eventual visual-regression layer rely on it.
- **Adding deps without approval.** Same rule as `/new-feature` — propose, get sign-off.
