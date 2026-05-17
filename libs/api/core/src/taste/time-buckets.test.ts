import { describe, it, expect } from "vitest";
import { bucketMonth, bucketTimeOfDay, bucketWeekday } from "./time-buckets.js";

// LOGIC-29 — pure helpers, total over every Date, deterministic.

describe("bucketWeekday", () => {
  it("maps each day of the week", () => {
    // 2026-05-17 is a Sunday — anchor reference.
    expect(bucketWeekday(new Date(2026, 4, 17, 12, 0))).toBe("sun");
    expect(bucketWeekday(new Date(2026, 4, 18, 12, 0))).toBe("mon");
    expect(bucketWeekday(new Date(2026, 4, 19, 12, 0))).toBe("tue");
    expect(bucketWeekday(new Date(2026, 4, 20, 12, 0))).toBe("wed");
    expect(bucketWeekday(new Date(2026, 4, 21, 12, 0))).toBe("thu");
    expect(bucketWeekday(new Date(2026, 4, 22, 12, 0))).toBe("fri");
    expect(bucketWeekday(new Date(2026, 4, 23, 12, 0))).toBe("sat");
  });
});

describe("bucketMonth", () => {
  it("maps each month of the year", () => {
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
    for (let i = 0; i < 12; i++) {
      expect(bucketMonth(new Date(2026, i, 15, 12, 0))).toBe(labels[i]);
    }
  });
});

describe("bucketTimeOfDay", () => {
  it("partitions the day into 6h slots", () => {
    expect(bucketTimeOfDay(new Date(2026, 4, 17, 3, 30))).toBe("night");
    expect(bucketTimeOfDay(new Date(2026, 4, 17, 8, 30))).toBe("morning");
    expect(bucketTimeOfDay(new Date(2026, 4, 17, 14, 30))).toBe("afternoon");
    expect(bucketTimeOfDay(new Date(2026, 4, 17, 20, 30))).toBe("evening");
  });

  it("treats boundary hours as the slot they start", () => {
    expect(bucketTimeOfDay(new Date(2026, 4, 17, 0, 0))).toBe("night");
    expect(bucketTimeOfDay(new Date(2026, 4, 17, 6, 0))).toBe("morning");
    expect(bucketTimeOfDay(new Date(2026, 4, 17, 12, 0))).toBe("afternoon");
    expect(bucketTimeOfDay(new Date(2026, 4, 17, 18, 0))).toBe("evening");
  });

  it("the last second of each slot stays in that slot", () => {
    expect(bucketTimeOfDay(new Date(2026, 4, 17, 5, 59, 59, 999))).toBe("night");
    expect(bucketTimeOfDay(new Date(2026, 4, 17, 11, 59, 59, 999))).toBe("morning");
    expect(bucketTimeOfDay(new Date(2026, 4, 17, 17, 59, 59, 999))).toBe("afternoon");
    expect(bucketTimeOfDay(new Date(2026, 4, 17, 23, 59, 59, 999))).toBe("evening");
  });
});
