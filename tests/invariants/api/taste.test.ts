// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-24.

import { describe, it } from "vitest";

describe("API-24: GET /api/me/taste/profile contract — auth, body shape, no Mongo leakage", () => {
  it.todo("returns 401 + ErrorResponse without a session cookie");
  it.todo("returns 200 + { buckets: [] } for a user with no buckets");
  it.todo("returns 200 + a TasteBucketsResponse-conforming body listing the user's buckets");
  it.todo("response carries no _id, no __v, no userId field belonging to a different session");
});
