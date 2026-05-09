// Layer 3 — Playwright.
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under BROWSER-03.

import { describe, it } from "vitest";

describe("BROWSER-03: mini-player mobile layout and touch targets", () => {
  it.todo(
    "on a 375×667 viewport the mini-player + bottom nav fit without horizontal scroll (Layer 3 — Playwright)",
  );
  it.todo("play/pause and dismiss buttons have a touch target ≥ 44×44 px (Layer 3 — Playwright)");
});
