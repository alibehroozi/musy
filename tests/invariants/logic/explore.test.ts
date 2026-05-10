// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-14.

import { describe, it } from "vitest";

describe("LOGIC-14: bumpScore extended for swipe events is deterministic and monotonic", () => {
  it.todo("bumpScore(0, 'swiped_right') returns 8");
  it.todo("bumpScore(0, 'swiped_left') returns 0 (no-op)");
  it.todo("bumpScore(8, 'swiped_right') returns 8 (never decreases)");
  it.todo("bumpScore(5, 'swiped_right') returns 8 (completed → swiped_right bumps up)");
  it.todo("bumpScore(8, 'swiped_left') returns 8 (left-swipe never decreases an existing score)");
  it.todo("bumpScore is deterministic — repeated calls with the same inputs yield the same output");
});
