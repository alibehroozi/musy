// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-02 and UI-03.

import { describe, it } from "vitest";

describe("UI-02: bottom navigation visible on all routes regardless of auth state", () => {
  it.todo("renders bottom nav on /explore");
  it.todo("renders bottom nav on /taste");
  it.todo("renders bottom nav on /search");
  it.todo("renders bottom nav on an unknown route (not-found fallback)");
});

describe("UI-03: exactly one nav tab carries aria-current='page' matching the active route", () => {
  it.todo("only the Explore tab is active on /explore");
  it.todo("only the Taste tab is active on /taste");
  it.todo("only the Search tab is active on /search");
});
