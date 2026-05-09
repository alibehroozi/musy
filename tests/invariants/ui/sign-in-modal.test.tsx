// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-09, UI-10.

import { describe, it } from "vitest";

describe("UI-09: anonymous tap on a result row OR add button opens the sign-in Modal and fires no event POST", () => {
  it.todo("tapping a row when unauthenticated opens the sign-in Modal");
  it.todo("tapping the add (save) button when unauthenticated opens the sign-in Modal");
  it.todo("no POST /api/search/explored is fired when an anonymous user taps a row");
  it.todo("no POST /api/search/saved is fired when an anonymous user taps the add button");
});

describe("UI-10: sign-in Modal sits at z-index --z-modal so it renders above the bottom navigation", () => {
  it.todo("the Modal root carries the z-modal class / inline style");
  it.todo("on a 375×667 viewport the Modal content is not occluded by the bottom nav");
});
