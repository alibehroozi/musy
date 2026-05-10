// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-10.

import { describe, it } from "vitest";

describe("DATA-10: swipes documents have required fields and (userId, at) + (userId, snapshotHash) compound indexes", () => {
  it.todo("schema marks userId, snapshot, snapshotHash, direction, at as required");
  it.todo('schema\'s direction enum is exactly {"right", "left"}');
  it.todo("schema declares a compound index on (userId, at)");
  it.todo("schema declares a compound index on (userId, snapshotHash)");
  it.todo(
    "the collection is append-only — repeating the same right-swipe creates two distinct documents",
  );
});
