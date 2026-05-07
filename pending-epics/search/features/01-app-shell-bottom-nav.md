---
epic: search
status: done
estimated-invariants: 4
implemented-in-pr: https://github.com/alibehroozi/musy/pull/3
---

# Feature 01: App shell — router + bottom nav

## Product description

Introduce a fixed bottom navigation bar to the moc PWA with three tabs in this order: **Explore**, **Taste**, **Search**. Tapping a tab switches the main view; the active tab is visually highlighted. The bottom nav is visible to anonymous and authenticated users alike. Explore and Taste are placeholder pages this epic (a centered "Coming soon" message is enough); Search is an empty page that later features fill in. This feature replaces the current "either SignInPage or blank main view" shell with a routed app shell that hosts the three tabs.

## User behavior

1. Anonymous user opens the app → lands on the Search tab by default → sees the bottom nav with Explore, Taste, Search; Search is highlighted; main area is empty (later features fill it).
2. User taps Explore → main area shows "Explore — coming soon"; Explore tab is highlighted.
3. User taps Taste → main area shows "Taste — coming soon"; Taste tab is highlighted.
4. User taps Search → main area shows the (still empty) Search page; Search tab is highlighted.
5. URL reflects the active tab (`/explore`, `/taste`, `/search`); refreshing the browser preserves the tab.
6. Authenticated user sees identical behavior — auth does not change the nav structure.

**Failure modes the user can reach:**

- Direct navigation to an unknown route (e.g. `/foo`) — the router falls back to the Search tab (or a 404 redirect to `/search`); the bottom nav stays visible.
- Tab pressed while another tab is loading (placeholder pages have no async loading, but account for it for forward compatibility) — tap is responsive, no flicker.

**Empty / first-run state:** The default route on app open is `/search`. The Search page is empty in this feature; later features render its contents.

## Design

**DS components used:** Typography (placeholder text on Explore + Taste), `BottomNav` (the new component).

**DS components required but missing:**

- **`lucide-react`** — wrapped by a thin DS `<Icon name="..." size="..." />` component so app code does not import `lucide-react` directly. Required for the three tab icons.
- **`BottomNav`** — fixed-position bar at `bottom: 0`, full-width, height ~64px, uses `--color-surface` background, `--color-border` top border. Three tab slots, each: icon (~24px) above label (`Typography variant="caption"`). Active state uses `--color-primary` for icon + label; inactive uses `--color-text-muted`. Touch target ≥ 44×44px. Safe-area inset on iOS (use `env(safe-area-inset-bottom)`).

**Layout notes:**

- The bottom nav is fixed; the main scrollable area must reserve `padding-bottom` equal to the nav height + safe-area, otherwise content gets occluded.
- The shell renders bottom nav + a `<main>` element that hosts the routed page. The current `App.tsx` shell (which switches between `SignInPage` and a blank main view) is replaced — `SignInPage` is no longer the root view; instead, anonymous users see the routed app and the _sign-in flow lives inside a Modal triggered by interactions_ (introduced in feature 5). For this feature, the bottom nav is sufficient — anonymous users on the empty Search page will not be prompted to sign in.

## Backend

**New endpoints:** none.

**New / changed Mongoose collections:** none.

**New env vars:** none.

## Tooling

**New deps:**

- `react-router-dom` (~v6 or v7, MIT license) — the de facto SPA router for React. Considered alternatives:
  - `@tanstack/react-router` — modern, type-safe, but heavier API surface; overkill for a 3-route mobile app.
  - Hand-rolled `useState` + `history.pushState` — fragile, doesn't handle back/forward properly, no nested routing for future epics.
  - `wouter` — minimal but smaller community and less mobile-tested.
- `lucide-react` (ISC license) — icon library, used via DS `Icon` wrapper.

**External services:** none.

## Privacy

What data crosses which boundary:

- User → API: nothing new (no API calls in this feature).
- API → third party: none.
- API → LLM prompt: none.
- Stays server-only: not applicable (no backend changes).

## Acceptance criteria

- [ ] Opening the app at `/` lands on `/search` with the Search tab highlighted.
- [ ] Direct navigation to `/explore`, `/taste`, `/search` shows the corresponding tab highlighted and the matching placeholder content.
- [ ] Browser back/forward navigates between previously visited tabs.
- [ ] Refreshing the page preserves the active tab.
- [ ] An unknown route (e.g. `/foo`) lands on `/search` (or shows a "Not found" placeholder that still has the bottom nav).
- [ ] Bottom nav is visible on every routed page.
- [ ] Bottom nav respects iOS safe-area-inset-bottom (no content under the home indicator).
- [ ] Anonymous users see the same nav and pages as authenticated users.
- [ ] On a 375×667 mobile viewport (iPhone SE), the bottom nav touch targets are ≥ 44×44 px and the placeholder content area scrolls without being occluded.

## Suggested invariants

The agent in `/new-invariant` will refine these — they're seeds, not commitments:

- **UI-02:** The bottom navigation is visible on every routed page (`/explore`, `/taste`, `/search`, and the not-found fallback) regardless of authentication state.
- **UI-03:** Exactly one of the three nav tabs has the active visual state at any time, matching the current route.
- **BROWSER-01:** On a 375×667 mobile viewport, the bottom nav reserves a touch target of at least 44×44 px per tab and respects `env(safe-area-inset-bottom)` so no content sits under the iOS home indicator.
- **PWA-01:** Refreshing the browser on `/explore`, `/taste`, or `/search` preserves the active tab (the SPA re-hydrates to the same route).

> **Note on UI-01:** The existing UI-01 ("shell shows SignIn or main view based on auth state") becomes incorrect with this feature — anonymous users now see the routed shell, not SignInPage. `/new-invariant` should propose either rewording UI-01 or deleting it in favor of UI-02; require user sign-off before removing.

## Implementation hint for /new-feature

This file is self-contained. The "Product description" becomes the feature description, the "Suggested invariants" seed `/new-invariant`'s exploration, and the "Acceptance criteria" are the manual-exercise checklist before opening the PR.

**Pre-flight DS work** (each is its own `/design-system` invocation, before this feature):

1. Add `lucide-react` + DS `Icon` wrapper.
2. Add `BottomNav` DS component.

**Suggested commit order** (per AGENTS.md commit discipline):

1. `spec: add UI-02, UI-03, BROWSER-01, PWA-01 (rework UI-01 if approved)`
2. `test(invariants): stub UI-02, UI-03, BROWSER-01, PWA-01 it.todo`
3. `feat(web): add react-router and routes.tsx with /explore, /taste, /search + not-found fallback`
4. `feat(web): replace App.tsx shell with router + BottomNav layout`
5. `feat(web): add Explore and Taste placeholder pages and empty SearchPage`
6. tests turning `it.todo` into real assertions (inline with each layer or as a final `test(web)` commit)
