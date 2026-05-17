// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-29..32.

import { describe, it, expect } from "vitest";
import {
  bucketMonth,
  bucketTimeOfDay,
  bucketWeekday,
  clampScore,
  generalScore,
  scoreDelta,
} from "@moc/api-core";

describe("LOGIC-29: bucketWeekday / bucketTimeOfDay / bucketMonth are deterministic and total", () => {
  it("bucketWeekday returns 'mon'..'sun' matching getDay()", () => {
    const labels = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    // 2026-05-17 is a Sunday.
    for (let i = 0; i < 7; i++) {
      const d = new Date(2026, 4, 17 + i, 12, 0);
      expect(bucketWeekday(d)).toBe(labels[d.getDay()]);
    }
  });

  it("bucketMonth returns 'jan'..'dec' matching getMonth()", () => {
    const labels = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    for (let m = 0; m < 12; m++) {
      expect(bucketMonth(new Date(2026, m, 15, 12, 0))).toBe(labels[m]);
    }
  });

  it("bucketTimeOfDay partitions [0..6) night, [6..12) morning, [12..18) afternoon, [18..24) evening", () => {
    expect(bucketTimeOfDay(new Date(2026, 4, 17, 3, 30))).toBe("night");
    expect(bucketTimeOfDay(new Date(2026, 4, 17, 9, 30))).toBe("morning");
    expect(bucketTimeOfDay(new Date(2026, 4, 17, 15, 30))).toBe("afternoon");
    expect(bucketTimeOfDay(new Date(2026, 4, 17, 21, 30))).toBe("evening");
  });

  it("boundary hours 0, 6, 12, 18 map to the slot they start", () => {
    expect(bucketTimeOfDay(new Date(2026, 4, 17, 0, 0))).toBe("night");
    expect(bucketTimeOfDay(new Date(2026, 4, 17, 6, 0))).toBe("morning");
    expect(bucketTimeOfDay(new Date(2026, 4, 17, 12, 0))).toBe("afternoon");
    expect(bucketTimeOfDay(new Date(2026, 4, 17, 18, 0))).toBe("evening");
  });
});

describe("LOGIC-30: scoreDelta(eventType) encodes the +10/+15/+5/set-0 rule", () => {
  it("right-swipe → { op: 'inc', delta: 10 }", () => {
    expect(scoreDelta("right-swipe")).toEqual({ op: "inc", delta: 10 });
  });
  it("save → { op: 'inc', delta: 15 }", () => {
    expect(scoreDelta("save")).toEqual({ op: "inc", delta: 15 });
  });
  it("listen-completed → { op: 'inc', delta: 5 }", () => {
    expect(scoreDelta("listen-completed")).toEqual({ op: "inc", delta: 5 });
  });
  it("left-swipe → { op: 'set', value: 0 }", () => {
    expect(scoreDelta("left-swipe")).toEqual({ op: "set", value: 0 });
  });
});

describe("LOGIC-31: clampScore folds any number into the integer range [0, 100]", () => {
  it("values > 100 collapse to 100", () => {
    expect(clampScore(101)).toBe(100);
    expect(clampScore(1e9)).toBe(100);
  });
  it("values < 0 collapse to 0", () => {
    expect(clampScore(-1)).toBe(0);
    expect(clampScore(-1e9)).toBe(0);
  });
  it("non-integer values are rounded toward zero", () => {
    expect(clampScore(3.9)).toBe(3);
    expect(clampScore(99.999)).toBe(99);
  });
  it("NaN / +Infinity / -Infinity collapse to 0", () => {
    expect(clampScore(Number.NaN)).toBe(0);
    expect(clampScore(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampScore(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe("LOGIC-32: generalScore(contextRows, bucketRows) computes the per-request ranking score", () => {
  it("empty inputs return 0", () => {
    expect(generalScore([], [])).toBe(0);
  });

  it("four populated axes return the arithmetic mean of their per-axis means", () => {
    const ctx = [
      { axis: "weekday" as const, value: "tue", score: 40 },
      { axis: "timeOfDay" as const, value: "evening", score: 60 },
      { axis: "month" as const, value: "may", score: 80 },
    ];
    const buckets = [{ bucketId: "b1", score: 20 }];
    expect(generalScore(ctx, buckets)).toBe(50);
  });

  it("missing axes contribute 0 to the mean (count is the full axis set)", () => {
    const ctx = [{ axis: "weekday" as const, value: "tue", score: 100 }];
    expect(generalScore(ctx, [])).toBe(25);
  });

  it("result is rounded to the nearest integer and clamped to [0, 100]", () => {
    const ctx = [
      { axis: "weekday" as const, value: "tue", score: 100 },
      { axis: "timeOfDay" as const, value: "evening", score: 100 },
      { axis: "month" as const, value: "may", score: 100 },
    ];
    const buckets = [{ bucketId: "b1", score: 100 }];
    expect(generalScore(ctx, buckets)).toBe(100);
  });
});
