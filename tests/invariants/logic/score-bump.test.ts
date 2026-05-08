// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-07.

import { describe, it, expect } from "vitest";
import { bumpScore } from "../../../libs/api/core/src/play/score-bump.js";

describe("LOGIC-07: bumpScore returns max(old, 3) for started; max(old, 5) for completed; score never decreases", () => {
  it('bumpScore(0, "started") returns 3', () => {
    expect(bumpScore(0, "started")).toBe(3);
  });

  it('bumpScore(0, "completed") returns 5', () => {
    expect(bumpScore(0, "completed")).toBe(5);
  });

  it('bumpScore(5, "started") returns 5 — does not decrease an already-higher score', () => {
    expect(bumpScore(5, "started")).toBe(5);
  });

  it('bumpScore(8, "completed") returns 8 — does not decrease a saved score', () => {
    expect(bumpScore(8, "completed")).toBe(8);
  });

  it('bumpScore(3, "completed") returns 5 — upgrades from explored to completed signal', () => {
    expect(bumpScore(3, "completed")).toBe(5);
  });

  it("bumpScore is deterministic — same inputs always produce same output", () => {
    for (let i = 0; i < 10; i++) {
      expect(bumpScore(2, "started")).toBe(3);
      expect(bumpScore(4, "completed")).toBe(5);
    }
  });
});
