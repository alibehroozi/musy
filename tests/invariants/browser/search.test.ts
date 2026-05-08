// Layer 3 — Playwright
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under BROWSER-02.

import { describe, it } from "vitest";

describe("BROWSER-02: search input visible at top of 375x667 viewport; results scrollable; bottom nav fixed", () => {
  it.todo("on a 375×667 mobile viewport the search input is visible without scrolling");
  it.todo("results list is scrollable below the sticky input");
  it.todo("bottom nav does not occlude the bottom-most result row");
});
