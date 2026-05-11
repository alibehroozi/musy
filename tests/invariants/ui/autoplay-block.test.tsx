// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-23.

import { describe, it } from "vitest";

describe("UI-23: first-pointerdown recovery from browser autoplay block", () => {
  it.todo(
    "on initial /explore mount where audio.play() rejects with NotAllowedError, the engine reaches 'paused' (not 'loading' forever) and a capture-phase pointerdown listener is attached to document",
  );
  it.todo(
    "the next pointerdown anywhere on document (card, action row, topbar) triggers togglePlay and the engine reaches 'playing' on the same track without advancing the queue",
  );
  it.todo(
    "after the one-shot listener fires, no further pointerdown auto-resumes (a user-initiated pause later in the session is not silently reversed by the next tap)",
  );
  it.todo(
    "swiping to the next card (a new engine.load) while in the autoplay-blocked paused state detaches the previous listener so a subsequent pointerdown does not call togglePlay on the wrong track",
  );
  it.todo(
    "engine 'paused' reached through any path other than autoplayBlocked (e.g. user tapped pause) does NOT install the listener",
  );
});
