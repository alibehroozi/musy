// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-11, LOGIC-12.

import { describe, it } from "vitest";

describe("LOGIC-11: formatProgress(currentMs, durationMs) is deterministic and total", () => {
  it.todo("returns fraction in [0, 1] for normal inputs and m:ss labels");
  it.todo("collapses durationMs <= 0, NaN, and non-finite inputs to { 0, '0:00', '-0:00' }");
  it.todo("clamps fraction to 1 and remainingLabel to '-0:00' when currentMs >= durationMs");
  it.todo("uses h:mm:ss when durationMs >= 1 hour");
});

describe("LOGIC-12: AudioEngine.seek(positionMs)", () => {
  it.todo("calls driver.seek with the equivalent seconds");
  it.todo("clamps positionMs to [0, durationMs] before applying");
  it.todo("emits exactly one stateChange per seek call");
  it.todo("is a no-op when no track is loaded (does not call driver.seek)");
});
