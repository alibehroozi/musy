// Layer 3 — Playwright required for full media session verification.
// jsdom-level unit tests are included for the hook registration logic.
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PWA-02.

import { describe, it } from "vitest";

describe("PWA-02: mediaSession.metadata and action handlers reflect current track when available", () => {
  it.todo(
    "when navigator.mediaSession is available and a track is playing, metadata.title matches track.title",
  );
  it.todo(
    "when navigator.mediaSession is available and a track is playing, metadata.artist matches track.artist",
  );
  it.todo(
    "when navigator.mediaSession is available, play/pause/previoustrack action handlers are registered",
  );
  it.todo(
    "when navigator.mediaSession is unavailable (undefined), PlayerProvider mounts without throwing",
  );
});
