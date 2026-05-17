// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-15.

import { describe, it } from "vitest";

describe("DATA-15: buckets document shape and (userId, id) + (userId, state) compound indexes", () => {
  it.todo("schema marks id, userId, name, kind, state, createdAt, lastBuiltAt as required");
  it.todo('schema\'s kind enum is exactly {"auto", "custom"}');
  it.todo('schema\'s state enum is exactly {"ready", "building", "failed"}');
  it.todo("schema declares a compound index on (userId, id)");
  it.todo("schema declares a compound index on (userId, state)");
});
