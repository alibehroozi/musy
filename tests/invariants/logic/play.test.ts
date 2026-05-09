// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-05, LOGIC-06.

import { describe, it } from "vitest";

describe("LOGIC-05: computeSnapshotHash is stable across whitespace and ASCII case in title and artist", () => {
  it.todo("equal (title, artist, durationSec) tuples produce equal SHA-256 hashes");
  it.todo("differing case in title produces the same hash");
  it.todo("leading/trailing whitespace in title or artist produces the same hash");
  it.todo("differing durationSec produces a different hash");
  it.todo("missing durationSec hashes consistently as 'unknown duration'");
});

describe("LOGIC-06: extractSourceFromHtml is deterministic given the same HTML input", () => {
  it.todo("same HTML produces the same parsed result on repeated calls");
  it.todo("HTML missing the embed JSON returns null");
  it.todo("malformed embed JSON returns null without throwing");
});
