// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-08.

import { describe, it } from "vitest";

describe("DATA-08: Every play_resolutions document has expiresAt > resolvedAt; snapshotHash is unique; TTL index configured", () => {
  it.todo("play_resolutions schema has a TTL index on expiresAt with expireAfterSeconds: 0");
  it.todo("play_resolutions schema has a unique index on snapshotHash");
  it.todo("RESOLUTION_TTL_MS is positive so expiresAt is always in the future on save");
});
