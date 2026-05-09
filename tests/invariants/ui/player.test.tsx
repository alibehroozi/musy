// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-11, UI-12, UI-13.

import { describe, it } from "vitest";

describe("UI-11: mini-player present/absent based on playback state", () => {
  it.todo("mini-player is absent when no track has ever been played (initial state)");
  it.todo("mini-player appears above bottom nav after a track starts loading");
  it.todo("mini-player remains visible when navigating between /search, /explore, /taste");
});

describe("UI-12: resolver returns source:null → failed mini-player, no audio src", () => {
  it.todo("when resolve returns source:null the mini-player renders in failed state");
  it.todo("no <audio> src is set when source is null");
});

describe("UI-13: currently-playing row marked with data-playing attribute", () => {
  it.todo("the row matching currentTrack has data-playing='true'");
  it.todo("non-matching rows do not have data-playing='true'");
});
