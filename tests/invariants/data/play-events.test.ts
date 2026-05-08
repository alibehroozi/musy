// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-06, DATA-07.

import { describe, it } from "vitest";

describe("DATA-06: listening_events documents have required fields; elapsedMs >= 0; compound index (userId, songKey, at) exists", () => {
  it.todo("listening_events schema has required fields: userId, songKey, eventType, at, elapsedMs");
  it.todo("listening_events schema has a compound index on (userId, songKey, at)");
  it.todo("elapsedMs field has a minimum value of 0 enforced by the schema");
});

describe("DATA-07: interest_scores has unique compound index (userId, songKey); score is monotonically non-decreasing", () => {
  it.todo("interest_scores schema has a unique compound index on (userId, songKey)");
  it.todo("score field has a minimum value of 0 in the schema");
});
