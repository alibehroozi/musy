// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-24.

import { describe, it } from "vitest";

describe("LOGIC-24: engine handles browser-autoplay-block as load → paused", () => {
  it.todo(
    "isAutoplayBlocked returns true for an Error whose name is exactly 'NotAllowedError', false for any other shape",
  );
  it.todo(
    "engine.load → driver.play() rejects with NotAllowedError → engine transitions to 'paused' and emits autoplayBlocked + stateChange",
  );
  it.todo(
    "engine.load → driver.play() rejects with a non-autoplay error (e.g. AbortError, DOMException) → engine stays in 'loading' so the existing error-event path can transition to 'failed'",
  );
  it.todo(
    "engine.load → driver fires 'error' BEFORE the play() rejection resolves → engine reaches 'failed'; the late NotAllowedError catch is a no-op",
  );
  it.todo(
    "togglePlay from 'paused' that calls driver.play() and is again rejected with NotAllowedError → engine returns to 'paused' (no infinite loading loop)",
  );
  it.todo(
    "autoplayBlocked event fires exactly once per qualifying rejection — additional non-NotAllowedError rejections or successful play() calls do not emit it",
  );
});
