// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-18.

import { describe, it } from "vitest";

describe("SEC-18: GET /api/me/taste/buckets/:bucketId ownership scope", () => {
  it.todo("user A requesting user B's bucketId returns 404, not 200 with B's data");
  it.todo(
    "bucket_song_scores query is scoped by the authenticated userId — B's scores never appear in A's response",
  );
});
