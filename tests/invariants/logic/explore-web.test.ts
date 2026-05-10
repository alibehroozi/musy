// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-17.

import { describe, it } from "vitest";

describe("LOGIC-17: directionFromDrag is deterministic and total", () => {
  it.todo("dx >= threshold returns 'right'");
  it.todo("dx <= -threshold returns 'left'");
  it.todo("|dx| < threshold returns null");
  it.todo("dy is irrelevant — varying dy never changes the result");
  it.todo("repeated calls with the same args produce identical output");
});
