// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-12 and UI-13.

import { describe, it } from "vitest";

describe("UI-12: now-playing overlay renders with role=dialog when expanded; absent when collapsed", () => {
  it.todo("when isExpanded is true, the overlay is in the DOM with role=dialog");
  it.todo("when isExpanded is false (collapsed), no role=dialog element is in the DOM");
  it.todo("the overlay contains a visible collapse/close button");
});

describe("UI-13: station variant shows LIVE indicator and disabled skips; track variant shows progress bar", () => {
  it.todo("for a track, the progress bar is rendered and skip-back button is not aria-disabled");
  it.todo("for a station, no progress bar is rendered");
  it.todo("for a station, skip-back and skip-forward buttons have aria-disabled=true");
  it.todo("for a station, a LIVE indicator element is visible");
});
