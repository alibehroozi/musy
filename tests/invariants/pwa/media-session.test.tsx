// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PWA-02.

import { describe, it } from "vitest";

describe("PWA-02: navigator.mediaSession integration", () => {
  it.todo(
    "when a track is loaded and mediaSession is available, metadata reflects title, artist, artwork",
  );
  it.todo("registers play, pause, and previoustrack action handlers");
  it.todo("rebinds metadata when the current track changes");
  it.todo("does not throw when navigator.mediaSession is undefined (older Safari, jsdom default)");
});
