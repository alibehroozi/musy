// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-08, UI-09.

import { describe, it } from "vitest";

describe("UI-08: anonymous user tap on row or add button opens sign-in Modal; no event POST fired", () => {
  it.todo("tapping a result row as anonymous opens the sign-in modal");
  it.todo("tapping the add button as anonymous opens the sign-in modal");
  it.todo("no POST to /search/explored or /search/saved is made when user is anonymous");
});

describe("UI-09: sign-in Modal is rendered with z-modal styling above the bottom navigation", () => {
  it.todo("sign-in modal element has z-modal class applied");
});
