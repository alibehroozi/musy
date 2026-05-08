// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-07.

import { describe, it } from "vitest";

describe("LOGIC-07: bumpScore returns max(old, 3) for started; max(old, 5) for completed; score never decreases", () => {
  it.todo('bumpScore(0, "started") returns 3');
  it.todo('bumpScore(0, "completed") returns 5');
  it.todo('bumpScore(5, "started") returns 5 — does not decrease an already-higher score');
  it.todo('bumpScore(8, "completed") returns 8 — does not decrease a saved score');
  it.todo('bumpScore(3, "completed") returns 5 — upgrades from explored to completed signal');
  it.todo("bumpScore is deterministic — same inputs always produce same output");
});
