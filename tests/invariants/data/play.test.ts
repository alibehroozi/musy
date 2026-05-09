// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-08.

import { describe, it, expect } from "vitest";
import { PlayResolutionsSchemaDefinition } from "../../../apps/api/src/modules/play/play-resolutions.schema.js";
import { RESOLUTION_TTL_MS } from "../../../apps/api/src/modules/play/play.repository.js";

describe("DATA-08: Every play_resolutions document has expiresAt > resolvedAt; snapshotHash is unique; TTL index configured", () => {
  it("play_resolutions schema has a TTL index on expiresAt with expireAfterSeconds: 0", () => {
    const indexes = PlayResolutionsSchemaDefinition.indexes();
    const ttlIndex = indexes.find(([fields, opts]) => {
      const hasExpiresAt = "expiresAt" in (fields as Record<string, unknown>);
      const hasTtl = typeof opts === "object" && opts !== null && "expireAfterSeconds" in opts;
      return hasExpiresAt && hasTtl;
    });
    expect(ttlIndex).toBeDefined();
    const opts = ttlIndex?.[1] as Record<string, unknown> | undefined;
    expect(opts?.["expireAfterSeconds"]).toBe(0);
  });

  it("play_resolutions schema has a unique index on snapshotHash", () => {
    const paths = PlayResolutionsSchemaDefinition.paths;
    const hashPath = paths["snapshotHash"];
    expect(hashPath).toBeDefined();
    const schemaType = hashPath as unknown as { options?: { unique?: boolean } };
    expect(schemaType.options?.unique).toBe(true);
  });

  it("RESOLUTION_TTL_MS is positive so expiresAt is always in the future on save", () => {
    expect(RESOLUTION_TTL_MS).toBeGreaterThan(0);
    const resolvedAt = new Date();
    const expiresAt = new Date(resolvedAt.getTime() + RESOLUTION_TTL_MS);
    expect(expiresAt.getTime()).toBeGreaterThan(resolvedAt.getTime());
  });
});
