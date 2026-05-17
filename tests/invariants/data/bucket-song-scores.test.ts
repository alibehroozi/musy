// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-16.

import { describe, it } from "vitest";

describe("DATA-16: bucket_song_scores document shape and unique (userId, bucketId, songKey) index", () => {
  it.todo("schema marks userId, bucketId, songKey, snapshot, score as required");
  it.todo("schema declares a unique compound index on (userId, bucketId, songKey)");
  it.todo("schema declares a compound index on (userId, bucketId, score: -1) for top-N reads");
  it.todo("schema constrains score to integer in [0, 100]");
});
