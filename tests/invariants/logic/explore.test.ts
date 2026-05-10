// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-14.

import { describe, it, expect } from "vitest";
import { bumpScore } from "@moc/api-core";

describe("LOGIC-14: bumpScore extended for swipe events is deterministic and monotonic", () => {
  it("bumpScore(0, 'swiped_right') returns 8", () => {
    expect(bumpScore(0, "swiped_right")).toBe(8);
  });

  it("bumpScore(0, 'swiped_left') returns 0 (no-op — left-swipe doesn't move the score)", () => {
    expect(bumpScore(0, "swiped_left")).toBe(0);
  });

  it("bumpScore(8, 'swiped_right') returns 8 (never decreases)", () => {
    expect(bumpScore(8, "swiped_right")).toBe(8);
  });

  it("bumpScore(5, 'swiped_right') returns 8 (completed → swiped_right bumps up)", () => {
    expect(bumpScore(5, "swiped_right")).toBe(8);
  });

  it("bumpScore(8, 'swiped_left') returns 8 (left-swipe never decreases an existing score)", () => {
    expect(bumpScore(8, "swiped_left")).toBe(8);
  });

  it("bumpScore is deterministic — repeated calls with the same inputs yield the same output", () => {
    for (let i = 0; i < 50; i++) {
      expect(bumpScore(0, "swiped_right")).toBe(8);
      expect(bumpScore(8, "swiped_left")).toBe(8);
    }
  });
});
