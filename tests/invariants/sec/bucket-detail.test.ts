// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-18.

import { describe, it } from "vitest";

describe("SEC-18: GET /api/me/taste/buckets/:bucketId — owner-scoped, no IDOR", () => {
  it.todo(
    "user A's bucket detail is never returned to user B (both reads filter by session userId)",
  );

  it.todo("user B requesting user A's bucketId receives 404, not 200 + bucket payload");

  it.todo(
    "no bucket_song_scores query is issued when the buckets lookup misses (verified via fake repo call log)",
  );

  it.todo(
    "userId-shaped path / query / body / header fields are ignored — only the session userId is used",
  );
});
