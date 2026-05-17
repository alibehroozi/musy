// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-29.

import { describe, it } from "vitest";

describe("API-29: GET /api/me/taste/buckets/:bucketId contract", () => {
  it.todo("returns 401 + ErrorResponse without a session cookie");

  it.todo("returns 200 + a BucketDetailResponse-conforming body with { bucket, songs }");

  it.todo("songs is server-sorted by score desc (then lastUpdatedAt desc, then songKey asc)");

  it.todo("songs is [] (never null, never missing) when the bucket has no bucket_song_scores rows");

  it.todo("bucket field carries the same coverArtworkUrl: string | null shape API-28 produces");

  it.todo(
    "returns 404 + ErrorResponse when the bucketId path param matches no bucket owned by the session user",
  );

  it.todo(
    "404 body is identical whether the bucket does not exist OR exists under a different userId (no probing oracle)",
  );

  it.todo("response body contains no Mongo internals (_id, __v)");

  it.todo("response carries no songs whose snapshot belongs to a different bucketId");
});
