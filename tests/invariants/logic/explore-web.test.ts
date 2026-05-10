// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-17.

import { describe, it, expect } from "vitest";
import { directionFromDrag } from "@moc/web-core";

describe("LOGIC-17: directionFromDrag is deterministic and total", () => {
  it("dx >= threshold returns 'right'", () => {
    expect(directionFromDrag({ dx: 100, dy: 0, threshold: 100 })).toBe("right");
    expect(directionFromDrag({ dx: 500, dy: 0, threshold: 100 })).toBe("right");
  });

  it("dx <= -threshold returns 'left'", () => {
    expect(directionFromDrag({ dx: -100, dy: 0, threshold: 100 })).toBe("left");
    expect(directionFromDrag({ dx: -500, dy: 0, threshold: 100 })).toBe("left");
  });

  it("|dx| < threshold returns null", () => {
    expect(directionFromDrag({ dx: 0, dy: 0, threshold: 100 })).toBe(null);
    expect(directionFromDrag({ dx: 50, dy: 0, threshold: 100 })).toBe(null);
    expect(directionFromDrag({ dx: -50, dy: 0, threshold: 100 })).toBe(null);
  });

  it("dy is irrelevant — varying dy never changes the result", () => {
    for (const dy of [-1000, -500, -10, 0, 10, 500, 1000]) {
      expect(directionFromDrag({ dx: 100, dy, threshold: 100 })).toBe("right");
      expect(directionFromDrag({ dx: -100, dy, threshold: 100 })).toBe("left");
      expect(directionFromDrag({ dx: 50, dy, threshold: 100 })).toBe(null);
    }
  });

  it("repeated calls with the same args produce identical output", () => {
    const args = { dx: 120, dy: 5, threshold: 100 };
    for (let i = 0; i < 50; i++) {
      expect(directionFromDrag(args)).toBe("right");
    }
  });
});
