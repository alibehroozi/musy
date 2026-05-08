// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-03.

import { describe, it } from "vitest";

describe("DATA-03: Every search_cache document has expiresAt > createdAt; queryHash is unique; TTL index is configured", () => {
  it.todo("search_cache schema has a TTL index on expiresAt with expireAfterSeconds: 0");
  it.todo("search_cache schema has a unique index on queryHash");
  it.todo("a saved cache entry has expiresAt strictly after the time it was created");
});
