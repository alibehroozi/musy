---
description: Plan an epic — interview, explore, break into features, write self-contained feature specs under pending-epics/
---

# Epic plan

The user has a broad idea for an epic — something bigger than a single `/new-feature` PR. Your job: turn that vision into a structured plan made of self-contained feature specs that `/new-feature` can pick up and ship one at a time.

The output is **`pending-epics/<epic-slug>/`**, committed to the repo. Future sessions read it; nothing is gitignored.

## Output shape

```
pending-epics/<epic-slug>/
├── EPIC.md                 # vision, why, feature list, tooling decisions, costs
└── features/
    ├── 01-<slug>.md        # ready-for-/new-feature spec
    ├── 02-<slug>.md
    └── ...
```

Numbering enforces implementation order. Each feature file is self-contained — `/new-feature` reads only that one file and has everything it needs.

## Phases

The command runs in five phases: **capture → explore → probe → break down → draft.** Don't skip; don't reorder.

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

### Phase 4 — Break down

Propose a feature breakdown:

- Each feature should land in a single `/new-feature` PR (~5–10 commits per AGENTS.md hard rule #10).
- Order matters — earlier features unblock later ones. Foundational concerns (auth, data shape, missing DS components) come first.
- 2–6 features per epic is the sweet spot. More than ~8 → the epic is two epics.

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

### Phase 5 — Draft files

Only enter Phase 5 after explicit user approval of the breakdown.

#### 5a — `EPIC.md`

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

#### 5b — `features/NN-<slug>.md`

Each feature gets a file with this exact shape (so `/new-feature` knows where to look):

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

**DS components used:** Typography (h1, body), Button (primary, lg), …
**DS components required but missing:** <list, or "none">
**Layout notes:** <terse — only what's not obvious from the components>

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

#### 5c — Show the user

Print:

- The epic slug
- Path to `EPIC.md`
- One-line summary of each feature file with its path

Then commit per the discipline: a single `spec(epic): plan <epic-slug>` since this is all spec/planning content.

## Hard rules

- **No fabricated answers.** If the user says "decide for me", propose a default explicitly and get confirmation before writing it into the file.
- **Open-source first** — same rule as `/new-feature` step 2 and AGENTS.md hard rule #6. For paid services, surface the free-tier limits and require explicit sign-off if anything paid is on the path.
- **Phases in order.** Don't draft files before the user approves the breakdown. Don't draft the breakdown before answers to the probe. Don't probe before exploring.
- **One epic at a time.** If the user describes two epics, split and run twice.
- **Commit-producing.** This command runs in worktrees fine (per AGENTS.md hard rule #11) — its output lands via the planning commit.

## Watch out for

- **"It'll be intuitive."** Push back. Concrete behavior or bust.
- **Hidden costs.** A "free" SDK that requires a paid tier for the relevant scope is not free for the epic. Read the pricing page; surface the actual relevant limit.
- **Skipping privacy.** Always ask. The user often hasn't thought about it; that's the point of the question.
- **Feature files that aren't self-contained.** `/new-feature` runs from the file alone — if the file references "see EPIC.md for context", that's a smell. Pull the relevant context into the feature file.
- **Too-fine breakdown.** A "feature" that lands in 1 commit is too small — it's an enhancement, fold it into a sibling. A feature that needs 20+ commits is too big — split.
- **Skipping the missing-DS-components flag.** `/new-feature` will catch it later, but it's much cheaper to surface in planning so the order can put DS work first.
