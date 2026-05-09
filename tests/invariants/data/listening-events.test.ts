// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-09.

import { describe, it } from "vitest";

describe("DATA-09: listening_events documents have required fields and a (userId, songKey, at) compound index", () => {
  it.todo("schema marks userId, songKey, source, externalId, eventType, elapsedMs, at as required");
  it.todo('schema\'s eventType enum is exactly {"started", "completed"}');
  it.todo("schema enforces elapsedMs >= 0 (min 0)");
  it.todo("schema declares a compound index on (userId, songKey, at)");
});
