import { describe, it, expect } from "vitest";
import { generalScore } from "./general-score.js";

// LOGIC-32 — pure helper.

describe("generalScore", () => {
  it("empty inputs return 0", () => {
    expect(generalScore([], [])).toBe(0);
  });

  it("four populated axes return the arithmetic mean of per-axis means", () => {
    // weekday axis mean = 40, timeOfDay = 60, month = 80, bucket = 20.
    // Per-axis mean = (40 + 60 + 80 + 20) / 4 = 50.
    const ctx = [
      { axis: "weekday" as const, value: "tue", score: 40 },
      { axis: "timeOfDay" as const, value: "evening", score: 60 },
      { axis: "month" as const, value: "may", score: 80 },
    ];
    const buckets = [{ bucketId: "b1", score: 20 }];
    expect(generalScore(ctx, buckets)).toBe(50);
  });

  it("an axis with multiple rows contributes its mean", () => {
    // weekday: (10 + 30) / 2 = 20; other axes 0 -> total = 5 (rounded).
    const ctx = [
      { axis: "weekday" as const, value: "tue", score: 10 },
      { axis: "weekday" as const, value: "wed", score: 30 },
    ];
    expect(generalScore(ctx, [])).toBe(5);
  });

  it("missing axes contribute 0 to the mean (denominator is the full axis set)", () => {
    // Only the weekday axis has a value of 100. Mean across 4 axes = 25.
    const ctx = [{ axis: "weekday" as const, value: "tue", score: 100 }];
    expect(generalScore(ctx, [])).toBe(25);
  });

  it("rounds to the nearest integer and clamps to [0, 100]", () => {
    // Every axis at 100 collapses to 100.
    const ctx = [
      { axis: "weekday" as const, value: "tue", score: 100 },
      { axis: "timeOfDay" as const, value: "evening", score: 100 },
      { axis: "month" as const, value: "may", score: 100 },
    ];
    const buckets = [{ bucketId: "b1", score: 100 }];
    expect(generalScore(ctx, buckets)).toBe(100);
  });
});
