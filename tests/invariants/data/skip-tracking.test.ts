// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-19.

import { describe, it } from "vitest";

describe("DATA-19: listening_events bucketId/bucketKind co-null invariant", () => {
  it.todo("record() with null bucketId and null bucketKind → both fields null in DB");
  it.todo("record() with non-null bucketId and non-null bucketKind → both fields set in DB");
  it.todo("(bucketId === null) === (bucketKind === null) for every persisted document");
});
