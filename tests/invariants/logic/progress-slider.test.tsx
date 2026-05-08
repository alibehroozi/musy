// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-08.

import { describe, it } from "vitest";

describe("LOGIC-08: ProgressSlider fires onScrub during drag and onScrubEnd once on pointer release", () => {
  it.todo("onScrub fires on each pointermove while pointer is captured (during drag)");
  it.todo("onScrubEnd fires exactly once on pointerup");
  it.todo("onScrubEnd does NOT fire during the drag (pointermove) phase");
  it.todo("onScrub does NOT fire after pointerup");
});
