---
epic: explore
status: pending
estimated-invariants: 0
---

# Feature 01: Card and IconButton design-system components

## Product description

Add two new components to `@moc/design-system` that the Explore tab UI (feature 6) and other future features will compose:

- **`Card`** — a content surface used as the swipe deck face. Renders arbitrary children, supports an optional inset overlay slot for things like the first-run onboarding panel, has `bg-surface` + `border-border` + `rounded-lg` + `shadow-lg` per the existing token set. Generic enough to be reusable beyond Explore (e.g. a future album / artist detail view).
- **`IconButton`** — a circular icon-only button used for the Explore action row (pass / pause / like) and any future single-tap action. Variants: `default`, `success`, `danger`. Sizes: `md` (44 px to meet the touch-target minimum) and `lg` (56 px). Tokenized colors throughout — no inline values.

Both ship via `/design-system` in a single PR. Each gets its own `feat(design-system, …)` commit, plus its own Ladle story, Vitest test suite, and `DESIGN.md` catalog row.

## User behavior

This is a design-system feature with no end-user-visible behavior beyond what consuming features build on top. Manual exercise:

1. `npm --workspace libs/web/design-system run stories` opens Ladle on http://localhost:61000.
2. The "Card" story page renders Card with sample children (e.g. a colored block representing artwork + a `Typography` line) on the dark surface.
3. The "IconButton" story page renders one of each `(variant × size)` combination, plus a disabled state.
4. `npm run verify` includes the design-system test workspace; the new tests pass.
5. The Lost Pixel baselines for both stories are committed (Layer 1 — components ring).

**Failure modes the user can reach:** none — design-system feature.

**Empty / first-run state:** not applicable.

## Design

**Visual mockup:** intent visible in [`../design/01-default.html`](../design/01-default.html) (the Card surface + the IconButton circle row are the dominant elements). All four mockups exercise both components.

**DS components used:** `Typography` (in stories only).

**DS components required but missing:** none — this feature _creates_ them.

**Layout notes:**

- `Card` defaults: `bg-surface`, `border-border`, `rounded-lg`, `shadow-lg`, `p-4`. No fixed dimensions — the consumer sizes via flex / grid. A `withOverlay` story shows a child positioned absolute over the rest of the card (used for the explore onboarding overlay).
- `IconButton` defaults: `rounded-full`, `bg-surface`, `border-border`. `size="md"` is `w-11 h-11` (44 px), `size="lg"` is `w-14 h-14` (56 px). Variant adjusts icon `color`: `default → text-text`, `success → text-success`, `danger → text-danger`. The component requires a non-empty `aria-label` prop (TS type-level enforcement).

## Backend

This is a frontend-only / design-system feature. No new endpoints, no new collections, no new env vars.

## Tooling

**New deps:** none. `Card` and `IconButton` ship using primitives already available (`react`, `Icon` from the same package).

**External services:** none.

## Privacy

Not applicable — pure UI components.

## Acceptance criteria

- [ ] `Card.stories.tsx` exports at minimum a `Default` and a `WithOverlay` story.
- [ ] `IconButton.stories.tsx` exports stories for each `(variant, size)` combination plus a `Disabled` story.
- [ ] `Card.test.tsx` asserts the rendered DOM has the expected token-driven classes (or computed style) and that arbitrary children pass through.
- [ ] `IconButton.test.tsx` asserts: (a) it renders a `<button>`, (b) it sets the passed `aria-label` (mandatory prop), (c) `disabled` removes it from the tab order, (d) clicking fires `onClick`, (e) the rendered touch-target is at least 44×44 px in `md` and 56×56 px in `lg`.
- [ ] `DESIGN.md` catalog table grows two rows (`Card` and `IconButton`).
- [ ] Lost Pixel snapshots for the new stories are committed (`.lostpixel/baseline/*`).
- [ ] Both components are re-exported from `libs/web/design-system/src/index.ts`.

## Suggested invariants

Design-system component features generally do not add to `INVARIANTS.md` — their guarantees live in component-level Vitest tests and Lost Pixel snapshots, not project-wide invariants. No new IDs expected here.

## Implementation hint for /new-feature

This file is self-contained, but the implementer should run **`/design-system Card`** and **`/design-system IconButton`** as two separate commands, both within the same branch / PR. Each `/design-system` run produces its own `feat(design-system, <name>):` commit; both ride one PR per the epic's "two micro-commits in one PR" plan.

**Where things live (per ARCHITECTURE.md / DESIGN.md):**

- `libs/web/design-system/src/components/Card/Card.tsx`
- `libs/web/design-system/src/components/Card/Card.test.tsx`
- `libs/web/design-system/src/components/Card/Card.stories.tsx`
- `libs/web/design-system/src/components/IconButton/IconButton.tsx`
- `libs/web/design-system/src/components/IconButton/IconButton.test.tsx`
- `libs/web/design-system/src/components/IconButton/IconButton.stories.tsx`
- `libs/web/design-system/src/index.ts` — add re-exports.
- `DESIGN.md` — add catalog rows for both components.
