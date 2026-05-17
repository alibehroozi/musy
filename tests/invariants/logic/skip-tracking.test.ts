// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-36, LOGIC-37.

import { describe, it, expect } from "vitest";
import { isSkip } from "@moc/api-core";

describe("LOGIC-36: isSkip({ playedMs, durationMs }) encodes the < 30 s AND < 50 % rule", () => {
  it("returns true when playedMs < 30_000 and ratio < 0.5", () => {
    expect(isSkip({ playedMs: 5_000, durationMs: 100_000 })).toBe(true);
  });

  it("returns false when playedMs >= 30_000 even if ratio < 0.5", () => {
    expect(isSkip({ playedMs: 30_000, durationMs: 100_000 })).toBe(false);
  });

  it("returns false when playedMs / durationMs >= 0.5 even if playedMs < 30_000", () => {
    // 10_000 / 20_000 === 0.5 → not < 0.5
    expect(isSkip({ playedMs: 10_000, durationMs: 20_000 })).toBe(false);
  });

  it("returns true just below the 30 s boundary", () => {
    expect(isSkip({ playedMs: 29_999, durationMs: 100_000 })).toBe(true);
  });

  it("returns true just below the 50 % boundary (fraction < 0.5)", () => {
    // 10_000 / 20_001 ≈ 0.4999… < 0.5 and 10_000 < 30_000
    expect(isSkip({ playedMs: 10_000, durationMs: 20_001 })).toBe(true);
  });

  it("returns false for a full listen (playedMs === durationMs)", () => {
    expect(isSkip({ playedMs: 240_000, durationMs: 240_000 })).toBe(false);
  });

  it("is deterministic: identical inputs always produce the same result", () => {
    for (let i = 0; i < 5; i++) {
      expect(isSkip({ playedMs: 5_000, durationMs: 100_000 })).toBe(true);
      expect(isSkip({ playedMs: 60_000, durationMs: 100_000 })).toBe(false);
    }
  });
});

describe("LOGIC-37: skip decrement fires only for custom-mix plays with a completed job row", () => {
  it.todo("bucketKind=custom with matching completed job row → decrement fires");
  it.todo("bucketKind=auto → no decrement, even if the song is skipped");
  it.todo("bucketKind=custom but no custom_mix_jobs row → graceful no-op + log");
  it.todo("null bucketKind (non-bucket play) → no decrement");
});
