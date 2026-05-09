// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-05, DATA-06, DATA-07.

import { describe, it } from "vitest";

describe("DATA-05: interest_scores has a unique compound index (userId, songKey); duplicate events produce one document", () => {
  it.todo("interest_scores schema has a unique compound index on (userId, songKey)");
  it.todo("songKey is required and equals `${source}:${externalId}` when persisted");
  it.todo("two upserts for the same (userId, source, externalId) leave exactly one document");
});

describe("DATA-06: interest_scores.score is monotonically non-decreasing per (userId, songKey) — max-rule", () => {
  it.todo("first 'explored' event sets score = 3");
  it.todo("subsequent 'saved' event raises score to 8");
  it.todo("subsequent 'explored' event after a 'saved' leaves score at 8 (does not drop to 3)");
});

describe("DATA-07: interest_scores.snapshot is written on first event and never overwritten", () => {
  it.todo("first event persists the snapshot fields verbatim");
  it.todo("second event with a different snapshot leaves the stored snapshot unchanged");
});
