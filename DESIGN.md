# Design System

The single source of truth for visual style. Owned by `libs/web/design-system`, consumed by `apps/web` (and any future React surface).

> **Tokens, not raw values.** Every color, size, radius, shadow in the app resolves to a token here. If a value isn't tokenized, the design system gets the token first — then the feature uses it. No `bg-[#5e2e92]`, no `mt-[7px]`, no off-system one-offs.

---

## Tokens

Tokens live in `libs/web/design-system/src/styles/theme.css` inside Tailwind v4's `@theme` block. They surface in two forms automatically:

- **CSS variables**: `var(--color-primary)`, `var(--spacing-4)`, etc. — for raw use in calculated styles.
- **Tailwind utilities**: `bg-primary`, `p-4`, `rounded-md`, `text-md` — for component code.

Both reference the same value. No drift possible.

### Colors

Dark-first palette. All values in `oklch` for predictable lightness across hues.

| Token         | Var                     | Tailwind utilities                             |
| ------------- | ----------------------- | ---------------------------------------------- |
| Background    | `--color-bg`            | `bg-bg`, `text-bg`                             |
| Surface       | `--color-surface`       | `bg-surface`                                   |
| Border        | `--color-border`        | `border-border`                                |
| Text          | `--color-text`          | `text-text`                                    |
| Muted text    | `--color-text-muted`    | `text-text-muted`                              |
| Primary       | `--color-primary`       | `bg-primary`, `text-primary`, `border-primary` |
| Primary hover | `--color-primary-hover` | `bg-primary-hover`, `hover:bg-primary-hover`   |
| Accent        | `--color-accent`        | `bg-accent`, `text-accent`                     |
| Success       | `--color-success`       | `bg-success`, `text-success`                   |
| Warning       | `--color-warning`       | `bg-warning`, `text-warning`                   |
| Danger        | `--color-danger`        | `bg-danger`, `text-danger`                     |

### Spacing

`--spacing-{0|1|2|3|4|6|8|12|16|24}` → `p-*`, `m-*`, `gap-*`, etc. Scale is rem-based, 0.25rem step at the low end.

### Radii

`--radius-{none|sm|md|lg|full}` → `rounded-none` … `rounded-full`.

### Font sizes

`--text-{xs|sm|md|lg|xl|2xl|3xl}` → `text-xs` … `text-3xl` (`text-md` is the body default).

### Font weights

`--font-weight-{regular|medium|semibold|bold}` → `font-regular`, `font-medium`, `font-semibold`, `font-bold`.

### Line heights

`--leading-{tight|normal|relaxed}` → `leading-tight`, `leading-normal`, `leading-relaxed`.

### Shadows

`--shadow-{sm|md|lg}` → `shadow-sm`, `shadow-md`, `shadow-lg`.

### Z-index

`--z-{dropdown|modal|tooltip|toast}` → `z-dropdown`, `z-modal`, `z-tooltip`, `z-toast`.

### Transitions

`--transition-{fast|normal|slow}` → for use with `transition-[duration]` in Tailwind utilities, e.g. `duration-[var(--transition-fast)]`.

---

## Components

Components live in `libs/web/design-system/src/components/<Name>/`. Each component folder ships:

- `<Name>.tsx` — implementation
- `<Name>.test.tsx` — Vitest + Testing Library
- `<Name>.stories.tsx` — Ladle stories

### Catalog

| Component    | Variants                        | Sizes          | Use for                                                                  |
| ------------ | ------------------------------- | -------------- | ------------------------------------------------------------------------ |
| `Typography` | `h1` `h2` `h3` `body` `caption` | —              | Any text rendering                                                       |
| `Button`     | `primary` `secondary` `ghost`   | `sm` `md` `lg` | All clickable actions                                                    |
| `Icon`       | —                               | `size` (px)    | Thin lucide-react wrapper; keeps app free of lucide imports              |
| `BottomNav`  | —                               | —              | Fixed bottom nav bar; tab routing + active highlight                     |
| `Modal`      | —                               | —              | Bottom-sheet on mobile, centered on desktop; focus-trap + ESC + backdrop |
| `IconButton` | `default` `filled`              | `sm` `md`      | Small touch-target button wrapping an icon (min 44×44 px)                |

The catalog grows via `/design-system`. Don't shortcut by hand-rolling components into `apps/web` and "moving them later" — that pattern accumulates duplicate visual logic.

---

## Adding or changing a component

Run `/design-system` and describe what you want. Same shape as `/new-feature`:

1. Tooling check — is anything new needed (Radix primitive, Floating UI for tooltip, etc.)?
2. Spec what the component does + its variants.
3. Implement in `libs/web/design-system/src/components/<Name>/`.
4. Tests + story land alongside.
5. Update this catalog.

Per AGENTS.md hard rule #10, the work lands as micro-commits: spec → tests → code (`feat(design-system, <name>): …`).

---

## Stories

```bash
npm --workspace libs/web/design-system run stories
```

Opens Ladle on http://localhost:61000. Stories are auto-discovered (`*.stories.tsx`). Use them for:

1. Visual review of components in isolation
2. Documentation for designers / reviewers
3. Future visual-regression target (Layer 3 — see `AGENTS.md`)

---

## Tests

```bash
npm --workspace libs/web/design-system run test
```

Component-level Vitest suites. Separate from the app's invariant tests so the design system can evolve independently. The app's `npm run verify` includes both via the root vitest config glob.

---

## When `/new-feature` calls into the design system

`/new-feature`'s "Design system check" step (after the tooling check) inspects the feature's UI requirements against this catalog. If the feature needs a tooltip and the catalog doesn't list one, the agent stops and asks: _"Tooltip is identified as a design-system component and is missing — add to the design system first?"_ On approval, the missing components land as separate `feat(design-system, …):` commits **before** the feature commits.
