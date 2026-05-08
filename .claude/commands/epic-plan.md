---
description: Plan an epic — interview, explore, break into features, write self-contained feature specs under product-specs/
---

# Epic plan

The user has a broad idea for an epic — something bigger than a single `/new-feature` PR. Your job: turn that vision into a structured plan made of self-contained feature specs that `/new-feature` can pick up and ship one at a time.

The output is **`product-specs/<epic-slug>/`**, committed to the repo. Future sessions read it; nothing is gitignored.

## Output shape

```
product-specs/<epic-slug>/
├── EPIC.md                 # vision, why, feature list, tooling decisions, costs
├── features/
│   ├── 01-<slug>.md        # ready-for-/new-feature spec
│   ├── 02-<slug>.md
│   └── ...
└── design/                 # transient — deleted by /new-feature when EPIC.md flips to status: done
    ├── tokens.css          # snapshot of @moc/design-system tokens
    ├── <state-1>.html      # one HTML mockup per page/state
    └── ...
```

Numbering enforces implementation order. Each feature file is self-contained — `/new-feature` reads only that one file and has everything it needs.

The `design/` folder is the only transient piece: it exists during the planning window so the user can iterate on visuals (Phase 4), and it's deleted after the epic is fully implemented. Everything else under `product-specs/` is kept forever as historical record.

## Phases

The command runs in six phases: **capture → explore → probe → mockup → break down → draft.** Don't skip; don't reorder.

The mockup phase exists to surface visual / UX problems _before_ committing to a feature breakdown — it's strictly visualization, never implementation. See Phase 4's scope guard.

### Phase 1 — Capture vision

1. **Ask what the epic is about, broadly.** One paragraph from the user is enough — restate it back in one sentence and confirm.
2. **Ask the strict-no-skip questions** (terse, batched, bullet-list answers):
   - **Value** — what user value does this give? what business value?
   - **User journey** — walk through the typical user's path through the epic (high-level steps, end-to-end)
   - **Out of scope** — what's NOT this epic? (forces sharper boundaries)
   - **Constraints** — deadlines, devices, data, regulatory? "none" is a valid answer
3. If any answer is hand-wavy ("it should be intuitive", "make it good"), push back for the concrete version. Don't proceed on vague.

### Phase 2 — Explore

Ground the plan in the codebase. Read:

- `INVARIANTS.md` — what categories already have rules; existing patterns to extend
- `ARCHITECTURE.md` — layering rules per package
- `DESIGN.md` — token reference, component catalog (which DS components exist)
- `libs/web/design-system/src/styles/theme.css` — actual token values; needed in Phase 4 to render mockups in real DS palette
- `apps/api/src/modules/` — existing domains
- `apps/web/src/features/` — existing features
- `libs/shared/contracts/src/` — existing schemas

Note findings briefly (3–5 bullets):

- What this epic builds on
- What it conflicts with (if any)
- What's already in place vs. what's truly new
- DS components likely needed; flag missing ones explicitly

### Phase 3 — Probe (the rest of the questions)

Ask in batches, terse, bullet-list. Don't dump every question at once — group by topic so the user can answer in flow.

**Design batch:**

- Which design-system components does the epic likely need? (the agent proposes a list, the user adjusts)
- Any missing components from `DESIGN.md`'s catalog? Each missing one becomes a `/design-system` task **before** the feature that needs it
- Visual/UX feel — anything beyond what tokens already cover (e.g. an animation pattern)?
- These answers feed Phase 4's wireframes directly. If the mockup later reaches for a component not in DS or in this list, that's a flag to come back here.

**User-behavior batch (per major flow):**

- Steps in order
- Expected outcome
- Failure modes the user can reach (network down, denied permission, empty state, etc.)
- Empty / first-run state — what does the user see before they've used the feature?

**Backend / data batch:**

- New data models? (one per Mongoose collection)
- New API endpoints? (rough shapes)
- Cross-user data flows? (drives `PRIVACY-*` invariants)
- Authorization rules? (drives `SEC-*` invariants)
- AI prompt path? (drives `AI-*` invariants)

**Tooling / cost batch:**

- New runtime deps the epic likely needs (auth lib? music-provider SDK? embedding provider?)
- For each, propose **2–3 open-source alternatives** with short reason. Open-source first.
- For paid services (e.g. provider APIs), note the **free tier** specifically — rate limits, monthly quotas, what triggers payment. **No paid commitment without explicit user approval.**
- Confirm cost-zero path is feasible; if not, surface the cheapest path and get sign-off

**Privacy batch (always ask, even if the user thinks it's irrelevant):**

- What user data does the epic touch?
- What goes to LLM prompts (if any)?
- What goes to third parties (music providers, analytics)?
- What stays purely server-side?

If the user's answer to any batch is "I don't know yet, decide for me" — propose a default and ask them to confirm. Don't fabricate without confirmation.

### Phase 4 — Visual mockup (hybrid: ASCII → HTML preview)

This phase is about **seeing** the epic, not building it. The artifacts produced here are throwaway: they live under `product-specs/<epic-slug>/design/` until the epic ships, then `/new-feature` deletes the folder on the commit that flips `EPIC.md` to `status: done`.

Identify each user-visible page or distinct state from Phase 1's user journey (e.g. for a Search epic: search-empty, search-loading, search-results, search-error). One mockup per state.

#### Phase 4a — ASCII wireframes (in chat)

For each page/state, render an ASCII wireframe directly in the chat using box-drawing characters and DS-token / component annotations. Example:

```
┌─────────────────────────────────────┐  [bg-bg]
│ 🔍  search                          │  [Input search variant, lg]
├─────────────────────────────────────┤
│  Try: Daft Punk    Try: Lo-fi       │  [Button ghost sm chips]
│  Try: BBC Radio 1                   │
├─────────────────────────────────────┤
│  ┌──┐ Hey Jude                      │  [ResultRow track]
│  │  │ The Beatles · 1968 · 7:11     │  [text-text-muted, caption]
│  └──┘                       [Deezer]│  [source badge, caption]
│  ...                                │
├─────────────────────────────────────┤
│   Explore   Taste   [Search]        │  [BottomNav fixed]
└─────────────────────────────────────┘
```

After each set of wireframes, ask: **"Approve, or change?"** Iterate by rewriting the wireframe in the next response — fast and cheap. **Do not proceed to 4b until every page wireframe has explicit user approval.** ASCII catches missing sections, wrong information ordering, and density problems at first glance — fix them here, before the higher-fidelity pass.

#### Phase 4b — HTML preview (fidelity pass)

Once all ASCII wireframes are approved:

1. **Snapshot tokens once.** Read `libs/web/design-system/src/styles/theme.css`. Extract the contents of the `@theme` block and write them to `product-specs/<epic-slug>/design/tokens.css` as a flat `:root { --color-bg: …; --spacing-4: …; … }` block. **Do not run Tailwind, do not import from `@moc/design-system`, do not add a build step or npm script.**
2. **One HTML file per page/state** at `product-specs/<epic-slug>/design/<state-slug>.html`. Each file is fully self-contained:
   - `<link rel="stylesheet" href="./tokens.css">` (relative path, no resolver tricks)
   - All page-specific CSS in a single inline `<style>` block — using `var(--color-…)` etc., **not Tailwind utility classes**
   - No JavaScript. No React. No external assets. Use solid colors or `data:` URI placeholders for images.
   - Mobile-first viewport meta + body sized for 375×667 (the BROWSER-\* invariant target)
3. **Multiple states are multiple files.** Empty / loading / results / error are four files, never one HTML page with toggle buttons. The point is to depict states, not simulate them.
4. **Preview & iterate.** For each file:
   - Spin up the design folder via `mcp__Claude_Preview__preview_start`
   - `mcp__Claude_Preview__preview_resize` to 375×667
   - `mcp__Claude_Preview__preview_screenshot` and show inline in chat
   - User reacts ("the row is too tall", "swap those two buttons", "this teal on dark is unreadable")
   - Edit the HTML file, re-screenshot. Loop until approved.
   - When done with the epic's mockups, `mcp__Claude_Preview__preview_stop`.
5. **Stop when the user approves all states.** Don't pre-emptively polish — fidelity for planning, not pixel-perfect comp work.

The HTML pass catches what ASCII can't: real contrast under DS tokens, density at the actual mobile width, token combinations that look wrong together, padding / radius / shadow proportions.

#### Phase 4c — Scope guard (read this every time before opening an editor)

The mockup phase has one failure mode: drifting into implementation. If during 4a/4b you find yourself reaching for any of these, **stop** — you're past planning:

- Editing anything under `apps/`, `libs/`, or root config (`vite.config.ts`, `tsconfig.json`, `package.json`)
- Running `npm install`, adding a dep, or adding an npm script
- Writing React (`.tsx`), JSX, hooks, components, or routes
- Writing a Ladle story, Playwright spec, or invariant test
- Running Tailwind, PostCSS, or any build step on the mockup HTML
- Adding interactivity to the mockup (click handlers, transitions tied to state, anything beyond a `<details>` toggle)
- Importing from `@moc/design-system` or `@moc/contracts`
- Pulling in npm icons, illustration libraries, web fonts beyond what's already in `theme.css`

If the mockup needs something that requires any of the above, the mockup is wrong-scoped — simplify the mockup, don't loosen the constraint. Real components, real routes, real tests are `/new-feature`'s job.

### Phase 5 — Break down

Propose a feature breakdown:

- Each feature should land in a single `/new-feature` PR (~5–10 commits per AGENTS.md hard rule #10).
- Order matters — earlier features unblock later ones. Foundational concerns (auth, data shape, missing DS components) come first.
- 2–6 features per epic is the sweet spot. More than ~8 → the epic is two epics.
- **Frontend / backend split — preference, not hard rule.** When a feature's UI work is substantial enough to be its own PR (a full page with multiple components, non-trivial state, several DS components), prefer splitting it from the backend work into `<NN>-<slug>-backend.md` and `<NN>-<slug>-ui.md`, with the backend feature numbered _before_ the UI that consumes it. When the UI is tiny (a single button on an existing page, a one-line tweak), keep the feature full-stack — the split would just churn. The existing `product-specs/search/` epic is the canonical example: feature 02 is `search-aggregator-backend`, feature 03 is `search-page-ui`. Use judgment; document the choice in `EPIC.md`'s feature list.

Show the proposed list to the user with one-sentence summaries:

```
Epic: <name>
1. Sign in with Google — establish auth
2. Connect Spotify — OAuth provider link
3. Capture listening events — ingest to Mongo
4. Generate taste profile — first AI call
5. Show profile on /me — first read path

Approve, or change the order / split / merge?
```

Loop until the user approves the list.

### Phase 6 — Draft files

Only enter Phase 6 after explicit user approval of the breakdown.

#### 6a — `EPIC.md`

Use this exact shape:

```markdown
---
status: planning
created: <today YYYY-MM-DD>
---

# Epic: <name>

## Vision

<one paragraph>

## Why

- User value: <…>
- Business value: <…>

## Features (in order)

1. [01-<slug>](./features/01-<slug>.md) — <one sentence>
2. [02-<slug>](./features/02-<slug>.md) — <one sentence>
   …

## Design system requirements

**Existing components used:** Typography, Button, …
**Missing components to add first** (each via `/design-system` before the feature that needs it):

- `Avatar` — needed for feature 03
- `Modal` — needed for feature 04

## Tooling decisions

- <capability>: <picked tool> — <license>, <free-tier note if any>. Considered: <alternatives>.
  …

## Costs

All tools open-source or within free tiers as of <today>:

- <provider>: <free-tier limits>
  …
  **No paid commitment without separate approval.**

## Constraints / out of scope

- <item>
- <item>
```

#### 6b — `features/NN-<slug>.md`

Each feature gets a file with this exact shape (so `/new-feature` knows where to look). When the FE/BE split applies (see Phase 5), use suffixes `<NN>-<slug>-backend.md` and `<NN>-<slug>-ui.md`; the template below covers both — irrelevant sections collapse to "none — backend feature" or "none — UI feature":

```markdown
---
epic: <epic-slug>
status: pending
estimated-invariants: <approx count>
---

# Feature NN: <Title>

## Product description

<2–4 sentences — what this feature is and why it exists from the user's perspective. This becomes the input to /new-feature.>

## User behavior

1. <step>
2. <step>
3. <expected outcome>

**Failure modes the user can reach:**

- <case>
- <case>

**Empty / first-run state:** <what the user sees before they've used it>

## Design

**Visual mockup:** [../design/<state-slug>.html](../design/<state-slug>.html) — design intent for this page (multiple states get their own files, list each). The Playwright `toHaveScreenshot` baselines added in `/new-feature` lock in what was approved here. _For backend-only features: "none — backend feature."_
**DS components used:** Typography (h1, body), Button (primary, lg), …
**DS components required but missing:** <list, or "none">
**Layout notes:** <terse — only what's not obvious from the mockup + components>

## Backend

**New endpoints:**

- `POST /<path>` — <purpose>, <auth>

**New / changed Mongoose collections:**

- `<name>` — fields, indexes

**New env vars:**

- `<NAME>` — <what it is>

## Tooling

**New deps:** <list with picks and alternatives, or "none">
**External services:** <name + free-tier note, or "none">

## Privacy

What data crosses which boundary:

- User → API: <…>
- API → third party: <…>
- API → LLM prompt: <…>
- Stays server-only: <…>

## Acceptance criteria

- [ ] <observable behavior>
- [ ] <observable behavior>
- [ ] <observable behavior>

## Suggested invariants

The agent in `/new-invariant` will refine these — they're seeds, not commitments:

- DATA-XX: <falsifiable property about stored data>
- API-XX: <falsifiable property about HTTP shape>
- SEC-XX: <auth / ownership rule>
- (PRIVACY-XX, AI-XX, UI-XX, BROWSER-XX, PWA-XX as applicable)

## Implementation hint for /new-feature

This file is self-contained. `/new-feature` can be invoked with this path; the
"Product description" becomes the feature description, the "Suggested invariants"
seed `/new-invariant`'s exploration, and the "Acceptance criteria" are the
manual-exercise checklist before opening the PR.
```

#### 6c — Show the user

Print:

- The epic slug
- Path to `EPIC.md`
- One-line summary of each feature file with its path
- Path to the design folder + the list of mockup files generated in Phase 4

Then commit per the discipline: a single `spec(epic): plan <epic-slug>` since this is all spec/planning content. The mockup files (`design/*.html`, `design/tokens.css`) are part of the same commit — they're planning artifacts, not separate concerns.

## Hard rules

- **No fabricated answers.** If the user says "decide for me", propose a default explicitly and get confirmation before writing it into the file.
- **Open-source first** — same rule as `/new-feature` step 2 and AGENTS.md hard rule #6. For paid services, surface the free-tier limits and require explicit sign-off if anything paid is on the path.
- **Phases in order.** Don't draft files before the user approves the breakdown. Don't break down before the mockups are approved. Don't mockup before the probe answers exist. Don't probe before exploring.
- **Mockups are planning artifacts, not code.** Phase 4's HTML files live exclusively under `product-specs/<epic-slug>/design/`. They are never imported from `apps/` or `libs/`, never wired to any build, never run through Tailwind / PostCSS, never converted into Ladle stories. They're deleted by `/new-feature` step 11 on the commit that flips `EPIC.md` to `status: done` — they would otherwise rot as the implementation moves on.
- **One epic at a time.** If the user describes two epics, split and run twice.
- **Commit-producing.** This command runs in worktrees fine (per AGENTS.md hard rule #11) — its output lands via the planning commit.

## Watch out for

- **"It'll be intuitive."** Push back. Concrete behavior or bust.
- **Hidden costs.** A "free" SDK that requires a paid tier for the relevant scope is not free for the epic. Read the pricing page; surface the actual relevant limit.
- **Skipping privacy.** Always ask. The user often hasn't thought about it; that's the point of the question.
- **Feature files that aren't self-contained.** `/new-feature` runs from the file alone — if the file references "see EPIC.md for context", that's a smell. Pull the relevant context into the feature file.
- **Too-fine breakdown.** A "feature" that lands in 1 commit is too small — it's an enhancement, fold it into a sibling. A feature that needs 20+ commits is too big — split.
- **Skipping the missing-DS-components flag.** `/new-feature` will catch it later, but it's much cheaper to surface in planning so the order can put DS work first.
- **Mockup phase becoming an implementation phase.** The instinct is to reach for the real components, the real router, the real Vite dev server. Refuse — re-read Phase 4c. Mockups are HTML + a token snapshot + inline styles. If the mockup wants more than that, the mockup is doing too much; trim it.
- **Pixel-polishing mockups.** Mockups are for catching wrong-shape, wrong-density, wrong-contrast — not for nailing exact spacing. Stop iterating once the user approves the structure and palette feel; the implementation pass through `/new-feature` does the rest.
- **Splitting FE/BE when the FE is tiny.** The split is a preference for substantial UI work. Don't mechanically apply it — a one-button feature gets one full-stack file.
