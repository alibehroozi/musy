// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-05.

import { describe, it } from "vitest";

describe("DATA-05: play_resolutions documents have expiresAt > resolvedAt; TTL index configured; snapshotHash is unique", () => {
  it.todo("play_resolutions schema has a TTL index on expiresAt with expireAfterSeconds: 0");
  it.todo("play_resolutions schema has a unique index on snapshotHash");
  it.todo(
    "RESOLUTION_TTL_MS is positive so expiresAt is always after resolvedAt when a document is saved",
  );
});
