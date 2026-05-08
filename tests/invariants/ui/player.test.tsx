// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-09, UI-10, and UI-11.

import { describe, it } from "vitest";

describe("UI-09: mini-player is visible above bottom nav when a track is playing or paused", () => {
  it.todo("mini-player region is rendered when engine status is playing");
  it.todo("mini-player region is rendered when engine status is paused");
  it.todo("mini-player is present on /explore while a track is playing");
  it.todo("mini-player is present on /taste while a track is playing");
  it.todo("mini-player is present on /search while a track is playing");
});

describe("UI-10: no mini-player is rendered when no track has ever been played", () => {
  it.todo("mini-player region is absent from the DOM on /search when engine status is idle");
  it.todo("mini-player region is absent from the DOM on /explore when engine status is idle");
});

describe("UI-11: currently-playing row has playing overlay; other rows do not", () => {
  it.todo(
    "result row for the currently-playing track has data-playing='true' on its artwork wrapper",
  );
  it.todo("result rows for non-playing tracks do not have data-playing='true'");
});
