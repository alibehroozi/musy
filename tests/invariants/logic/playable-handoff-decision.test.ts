// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-23.

import { describe, it, expect } from "vitest";
import { playableHandoffDecision } from "@moc/web-core";

describe("LOGIC-23: playableHandoffDecision is deterministic and total", () => {
  it("returns false when durationMs is 0 (no track loaded)", () => {
    expect(playableHandoffDecision({ progressMs: 0, durationMs: 0, lookaheadMs: 5_000 })).toBe(
      false,
    );
    expect(playableHandoffDecision({ progressMs: 0, durationMs: -1, lookaheadMs: 5_000 })).toBe(
      false,
    );
  });

  it("returns false when remaining time exceeds lookaheadMs", () => {
    // 30s track, only 5s in, lookahead 5s → 25s remaining → not yet
    expect(
      playableHandoffDecision({ progressMs: 5_000, durationMs: 30_000, lookaheadMs: 5_000 }),
    ).toBe(false);
    // 200s remaining
    expect(
      playableHandoffDecision({ progressMs: 100_000, durationMs: 300_000, lookaheadMs: 5_000 }),
    ).toBe(false);
  });

  it("returns true exactly once remaining time falls within (0, lookaheadMs]", () => {
    // Exactly at the boundary: 5s remaining, lookahead 5s
    expect(
      playableHandoffDecision({ progressMs: 25_000, durationMs: 30_000, lookaheadMs: 5_000 }),
    ).toBe(true);
    // 1s remaining
    expect(
      playableHandoffDecision({ progressMs: 29_000, durationMs: 30_000, lookaheadMs: 5_000 }),
    ).toBe(true);
    // Just past the boundary: 5_001ms remaining — not yet
    expect(
      playableHandoffDecision({ progressMs: 24_999, durationMs: 30_000, lookaheadMs: 5_000 }),
    ).toBe(false);
  });

  it("returns false when progressMs >= durationMs (already ended)", () => {
    expect(
      playableHandoffDecision({ progressMs: 30_000, durationMs: 30_000, lookaheadMs: 5_000 }),
    ).toBe(false);
    expect(
      playableHandoffDecision({ progressMs: 31_000, durationMs: 30_000, lookaheadMs: 5_000 }),
    ).toBe(false);
  });

  it("returns false for NaN / non-finite progressMs or durationMs", () => {
    expect(
      playableHandoffDecision({ progressMs: NaN, durationMs: 30_000, lookaheadMs: 5_000 }),
    ).toBe(false);
    expect(playableHandoffDecision({ progressMs: 0, durationMs: NaN, lookaheadMs: 5_000 })).toBe(
      false,
    );
    expect(
      playableHandoffDecision({ progressMs: Infinity, durationMs: 30_000, lookaheadMs: 5_000 }),
    ).toBe(false);
    expect(
      playableHandoffDecision({ progressMs: 0, durationMs: Infinity, lookaheadMs: 5_000 }),
    ).toBe(false);
    expect(
      playableHandoffDecision({ progressMs: -1, durationMs: 30_000, lookaheadMs: 5_000 }),
    ).toBe(false);
  });

  it("returns false for lookaheadMs <= 0", () => {
    expect(
      playableHandoffDecision({ progressMs: 28_000, durationMs: 30_000, lookaheadMs: 0 }),
    ).toBe(false);
    expect(
      playableHandoffDecision({ progressMs: 28_000, durationMs: 30_000, lookaheadMs: -1_000 }),
    ).toBe(false);
    expect(
      playableHandoffDecision({ progressMs: 28_000, durationMs: 30_000, lookaheadMs: NaN }),
    ).toBe(false);
  });

  it("repeated calls with identical args produce identical output (no I/O)", () => {
    const args = { progressMs: 28_000, durationMs: 30_000, lookaheadMs: 5_000 };
    for (let i = 0; i < 50; i++) {
      expect(playableHandoffDecision(args)).toBe(true);
    }
    const noArgs = { progressMs: 0, durationMs: 0, lookaheadMs: 5_000 };
    for (let i = 0; i < 50; i++) {
      expect(playableHandoffDecision(noArgs)).toBe(false);
    }
  });
});
