// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-14, UI-15.

import { describe, it } from "vitest";

describe("UI-14: NowPlayingOverlay rendering follows isExpanded + currentTrack", () => {
  it.todo("when isExpanded is true and a track is loaded, the overlay is in the DOM");
  it.todo("the overlay carries role='dialog' and aria-modal='true'");
  it.todo("when isExpanded is false, the overlay is not in the DOM");
  it.todo("when no track is loaded, the overlay is not in the DOM even if isExpanded is true");
});

describe("UI-15: track variant vs station variant", () => {
  it.todo(
    "for a track snapshot, renders the progress bar (slider role) and an enabled skip-back button",
  );
  it.todo(
    "for a station snapshot, renders the LIVE indicator (no progress slider) and both skip buttons carry aria-disabled='true'",
  );
});
