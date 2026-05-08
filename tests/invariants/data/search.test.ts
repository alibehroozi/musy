// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-03, DATA-04.

import { describe, it, expect } from "vitest";
import { SearchCacheSchemaDefinition } from "../../../apps/api/src/modules/search/search-cache.schema.js";
import { CACHE_TTL_MS } from "../../../apps/api/src/modules/search/search.repository.js";
import { SearchHistorySchemaDefinition } from "../../../apps/api/src/modules/search/search-history.schema.js";

describe("DATA-03: Every search_cache document has expiresAt > createdAt; queryHash is unique; TTL index is configured", () => {
  it("search_cache schema has a TTL index on expiresAt with expireAfterSeconds: 0", () => {
    const indexes = SearchCacheSchemaDefinition.indexes();
    const ttlIndex = indexes.find(([fields, opts]) => {
      const hasExpiresAt = "expiresAt" in (fields as Record<string, unknown>);
      const hasTtl = typeof opts === "object" && opts !== null && "expireAfterSeconds" in opts;
      return hasExpiresAt && hasTtl;
    });
    expect(ttlIndex).toBeDefined();
    const opts = ttlIndex?.[1] as Record<string, unknown> | undefined;
    expect(opts?.["expireAfterSeconds"]).toBe(0);
  });

  it("search_cache schema has a unique index on queryHash", () => {
    const paths = SearchCacheSchemaDefinition.paths;
    const queryHashPath = paths["queryHash"];
    expect(queryHashPath).toBeDefined();
    // Mongoose marks the path's options
    const schemaType = queryHashPath as unknown as { options?: { unique?: boolean } };
    expect(schemaType.options?.unique).toBe(true);
  });

  it("CACHE_TTL_MS is positive so expiresAt is always in the future when a document is saved", () => {
    expect(CACHE_TTL_MS).toBeGreaterThan(0);
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + CACHE_TTL_MS);
    expect(expiresAt.getTime()).toBeGreaterThan(createdAt.getTime());
  });
});

describe("DATA-04: search_history has a unique compound index (userId, query); duplicate submissions create one document", () => {
  it("search_history schema has a unique compound index on (userId, query)", () => {
    const indexes = SearchHistorySchemaDefinition.indexes();
    const compoundUniqueIndex = indexes.find(([fields, opts]) => {
      const f = fields as Record<string, unknown>;
      return (
        "userId" in f &&
        "query" in f &&
        typeof opts === "object" &&
        opts !== null &&
        (opts as Record<string, unknown>)["unique"] === true
      );
    });
    expect(compoundUniqueIndex).toBeDefined();
  });

  it("search_history schema has a range index on (userId, lastSearchedAt: -1)", () => {
    const indexes = SearchHistorySchemaDefinition.indexes();
    const rangeIndex = indexes.find(([fields]) => {
      const f = fields as Record<string, unknown>;
      return "userId" in f && "lastSearchedAt" in f && f["lastSearchedAt"] === -1;
    });
    expect(rangeIndex).toBeDefined();
  });

  it("schema has no TTL index — history persists indefinitely", () => {
    const indexes = SearchHistorySchemaDefinition.indexes();
    const ttlIndex = indexes.find(([_fields, opts]) => {
      return typeof opts === "object" && opts !== null && "expireAfterSeconds" in opts;
    });
    expect(ttlIndex).toBeUndefined();
  });
});
