// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-38.

import { describe, it, expect } from "vitest";
import { nextPollDelayMs } from "./polling-cadence.js";

describe("LOGIC-38: nextPollDelayMs cadence — 3s baseline, 8s after 30s, stop at 2min", () => {
  it("returns 3_000 at elapsedMs === 0", () => {
    expect(nextPollDelayMs({ elapsedMs: 0 })).toBe(3_000);
  });

  it("returns 3_000 just below the 30s threshold (29_999)", () => {
    expect(nextPollDelayMs({ elapsedMs: 29_999 })).toBe(3_000);
  });

  it("returns 8_000 at the 30s threshold", () => {
    expect(nextPollDelayMs({ elapsedMs: 30_000 })).toBe(8_000);
  });

  it("returns 8_000 just below the 2min threshold (119_999)", () => {
    expect(nextPollDelayMs({ elapsedMs: 119_999 })).toBe(8_000);
  });

  it("returns null at the 2min threshold (stop polling)", () => {
    expect(nextPollDelayMs({ elapsedMs: 120_000 })).toBeNull();
  });

  it("returns null past the 2min threshold", () => {
    expect(nextPollDelayMs({ elapsedMs: 600_000 })).toBeNull();
  });

  it("returns 3_000 for negative elapsedMs (clock skew defense)", () => {
    expect(nextPollDelayMs({ elapsedMs: -1_000 })).toBe(3_000);
  });

  it("returns 3_000 for NaN elapsedMs (defensive default)", () => {
    expect(nextPollDelayMs({ elapsedMs: Number.NaN })).toBe(3_000);
  });

  it("returns 3_000 for -Infinity (defensive default)", () => {
    expect(nextPollDelayMs({ elapsedMs: -Infinity })).toBe(3_000);
  });

  it("returns null for +Infinity (treated as past-2min stop)", () => {
    // +Infinity is unambiguously past the 2-minute stop; only finite-but-broken
    // inputs (NaN, -Infinity, negatives) get the defensive 3_000 fallback so a
    // genuinely-stopped poll doesn't silently restart.
    expect(nextPollDelayMs({ elapsedMs: Infinity })).toBeNull();
  });

  it("is deterministic — same input always returns the same output", () => {
    const first = nextPollDelayMs({ elapsedMs: 45_000 });
    const second = nextPollDelayMs({ elapsedMs: 45_000 });
    expect(first).toBe(second);
  });
});
