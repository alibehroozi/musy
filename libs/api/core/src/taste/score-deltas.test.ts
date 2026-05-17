import { describe, it, expect } from "vitest";
import { clampScore, scoreDelta } from "./score-deltas.js";

// LOGIC-30 / LOGIC-31 — pure helpers.

describe("scoreDelta", () => {
  it("right-swipe → +10", () => {
    expect(scoreDelta("right-swipe")).toEqual({ op: "inc", delta: 10 });
  });
  it("save → +15", () => {
    expect(scoreDelta("save")).toEqual({ op: "inc", delta: 15 });
  });
  it("listen-completed → +5", () => {
    expect(scoreDelta("listen-completed")).toEqual({ op: "inc", delta: 5 });
  });
  it("left-swipe → set 0", () => {
    expect(scoreDelta("left-swipe")).toEqual({ op: "set", value: 0 });
  });
});

describe("clampScore", () => {
  it("collapses values > 100 to 100", () => {
    expect(clampScore(101)).toBe(100);
    expect(clampScore(1000)).toBe(100);
  });
  it("collapses values < 0 to 0", () => {
    expect(clampScore(-1)).toBe(0);
    expect(clampScore(-1000)).toBe(0);
  });
  it("rounds non-integer values toward zero", () => {
    expect(clampScore(3.9)).toBe(3);
    expect(clampScore(99.999)).toBe(99);
  });
  it("collapses NaN / Infinity / -Infinity to 0", () => {
    expect(clampScore(Number.NaN)).toBe(0);
    expect(clampScore(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampScore(Number.NEGATIVE_INFINITY)).toBe(0);
  });
  it("preserves integers already inside the range", () => {
    expect(clampScore(0)).toBe(0);
    expect(clampScore(50)).toBe(50);
    expect(clampScore(100)).toBe(100);
  });
});
