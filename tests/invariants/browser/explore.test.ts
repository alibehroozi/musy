// Layer 3 — Playwright. Real assertions live in
// `apps/web/tests/e2e/explore-page-ui.spec.ts`.
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under BROWSER-05, BROWSER-06.

import { describe, it } from "vitest";

describe("BROWSER-05: explore card stack + action row mobile layout", () => {
  it.todo(
    "on a 375×667 viewport each IconButton in the action row has a touch target ≥ 44×44 px (Layer 3 — Playwright)",
  );
  it.todo("the action row fits without horizontal scroll on 375×667 (Layer 3 — Playwright)");
  it.todo(
    "the explore card stack fits without horizontal scroll and the topmost card's artwork is ≥ 240×240 px on 375×667 (Layer 3 — Playwright)",
  );
});

describe("BROWSER-06: WCAG 2.1 AA passes on every Explore state", () => {
  it.todo("default state passes axe-core WCAG 2.1 AA (Layer 3 — Playwright)");
  it.todo("mid-swipe-right state passes axe-core WCAG 2.1 AA (Layer 3 — Playwright)");
  it.todo("refilling state passes axe-core WCAG 2.1 AA (Layer 3 — Playwright)");
  it.todo("onboarding state passes axe-core WCAG 2.1 AA (Layer 3 — Playwright)");
});
