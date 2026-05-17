// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-29.

import { describe, it } from "vitest";

describe("API-29: GET /api/me/taste/buckets/:bucketId contract", () => {
  it.todo("returns 401 + ErrorResponse without a session cookie");
  it.todo("returns 404 + ErrorResponse for a bucketId not belonging to the authenticated user");
  it.todo("returns 404 + ErrorResponse for a bucketId that does not exist");
  it.todo("returns 200 + BucketDetailResponse with bucket and songs sorted score desc");
  it.todo("BucketDetailResponse songs tie-break by lastUpdatedAt desc when scores are equal");
  it.todo("includes coverArtworkUrl on the bucket (per API-28 rule)");
  it.todo("returns songs: [] when the bucket has no bucket_song_scores rows");
});
