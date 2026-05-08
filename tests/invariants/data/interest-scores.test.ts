// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-05, DATA-06, DATA-07.

import { describe, it } from "vitest";

describe("DATA-05: interest_scores has a unique compound index (userId, songKey); same user+song produces exactly one document", () => {
  it.todo("interest_scores schema has a unique compound index on (userId, songKey)");
  it.todo("submitting two events for the same (userId, songKey) does not create a second document");
});

describe("DATA-06: interest_scores.score is monotonically non-decreasing per (userId, songKey)", () => {
  it.todo("explored event (score 3) after a saved event (score 8) leaves score at 8");
  it.todo("saved event (score 8) after an explored event (score 3) raises score to 8");
  it.todo("duplicate explored events leave score unchanged at 3");
});

describe("DATA-07: interest_scores.snapshot is written once on first event and never overwritten", () => {
  it.todo("snapshot fields match what was submitted on the first event");
  it.todo("subsequent events on the same (userId, songKey) do not change the snapshot");
});
