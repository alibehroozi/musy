import { describe, it, expect } from "vitest";
import { directionFromDrag } from "./direction-from-drag.js";

describe("directionFromDrag", () => {
  it("returns 'right' when dx >= threshold", () => {
    expect(directionFromDrag({ dx: 100, dy: 0, threshold: 100 })).toBe("right");
    expect(directionFromDrag({ dx: 200, dy: -50, threshold: 100 })).toBe("right");
  });

  it("returns 'left' when dx <= -threshold", () => {
    expect(directionFromDrag({ dx: -100, dy: 0, threshold: 100 })).toBe("left");
    expect(directionFromDrag({ dx: -200, dy: 50, threshold: 100 })).toBe("left");
  });

  it("returns null when |dx| < threshold", () => {
    expect(directionFromDrag({ dx: 0, dy: 0, threshold: 100 })).toBe(null);
    expect(directionFromDrag({ dx: 99, dy: 0, threshold: 100 })).toBe(null);
    expect(directionFromDrag({ dx: -99, dy: 0, threshold: 100 })).toBe(null);
  });

  it("dy is irrelevant — varying dy never changes the result", () => {
    for (const dy of [-1000, -100, -1, 0, 1, 100, 1000]) {
      expect(directionFromDrag({ dx: 100, dy, threshold: 100 })).toBe("right");
      expect(directionFromDrag({ dx: -100, dy, threshold: 100 })).toBe("left");
      expect(directionFromDrag({ dx: 50, dy, threshold: 100 })).toBe(null);
    }
  });
});
