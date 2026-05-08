// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-07.

import { describe, it, expect } from "vitest";
import { formatProgress } from "@moc/web-core";

describe("LOGIC-07: formatProgress is deterministic and handles all edge cases without throwing", () => {
  it("normal input: currentMs=30000, durationMs=240000 → fraction=0.125, currentLabel='0:30', remainingLabel='-3:30'", () => {
    const result = formatProgress(30_000, 240_000);
    expect(result.fraction).toBeCloseTo(0.125);
    expect(result.currentLabel).toBe("0:30");
    expect(result.remainingLabel).toBe("-3:30");
  });

  it("currentMs=0 and durationMs=0 → fraction=0, non-throwing result", () => {
    expect(() => formatProgress(0, 0)).not.toThrow();
    const result = formatProgress(0, 0);
    expect(result.fraction).toBe(0);
    expect(result.currentLabel).toBe("0:00");
  });

  it("durationMs=NaN → fraction=0, non-throwing result", () => {
    expect(() => formatProgress(5000, NaN)).not.toThrow();
    const result = formatProgress(5000, NaN);
    expect(result.fraction).toBe(0);
  });

  it("durationMs=Infinity → fraction=0, non-throwing result", () => {
    expect(() => formatProgress(5000, Infinity)).not.toThrow();
    const result = formatProgress(5000, Infinity);
    expect(result.fraction).toBe(0);
  });

  it("currentMs > durationMs → fraction clamped to 1", () => {
    const result = formatProgress(300_000, 240_000);
    expect(result.fraction).toBe(1);
  });

  it("negative currentMs → fraction=0, non-throwing result", () => {
    expect(() => formatProgress(-1000, 240_000)).not.toThrow();
    const result = formatProgress(-1000, 240_000);
    expect(result.fraction).toBe(0);
  });

  it("same inputs always produce identical output (deterministic)", () => {
    const a = formatProgress(60_000, 180_000);
    const b = formatProgress(60_000, 180_000);
    expect(a).toEqual(b);
  });
});
