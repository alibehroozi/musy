// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-15.

import { describe, it, expect } from "vitest";
import { BucketsSchemaDefinition } from "../../../apps/api/src/modules/taste/buckets.schema.js";

describe("DATA-15: buckets document shape and (userId, id) + (userId, state) compound indexes", () => {
  it("schema marks id, userId, name, kind, state, createdAt, lastBuiltAt as required", () => {
    const paths = BucketsSchemaDefinition.paths;
    for (const p of ["id", "userId", "name", "kind", "state", "createdAt", "lastBuiltAt"]) {
      const opts = (paths[p] as unknown as { options?: { required?: unknown } }).options;
      expect(opts?.required, `${p} should be required`).toBe(true);
    }
  });

  it('schema\'s kind enum is exactly {"auto", "custom"}', () => {
    const opts = (
      BucketsSchemaDefinition.paths["kind"] as unknown as {
        options?: { enum?: unknown };
      }
    ).options;
    expect(opts?.enum).toEqual(["auto", "custom"]);
  });

  it('schema\'s state enum is exactly {"ready", "building", "failed"}', () => {
    const opts = (
      BucketsSchemaDefinition.paths["state"] as unknown as {
        options?: { enum?: unknown };
      }
    ).options;
    expect(opts?.enum).toEqual(["ready", "building", "failed"]);
  });

  it("schema declares a compound index on (userId, id)", () => {
    const indexes = BucketsSchemaDefinition.indexes();
    const compound = indexes.find(([fields]) => {
      const f = fields as Record<string, unknown>;
      return Object.keys(f).length === 2 && "userId" in f && "id" in f;
    });
    expect(compound).toBeDefined();
  });

  it("schema declares a compound index on (userId, state)", () => {
    const indexes = BucketsSchemaDefinition.indexes();
    const compound = indexes.find(([fields]) => {
      const f = fields as Record<string, unknown>;
      return Object.keys(f).length === 2 && "userId" in f && "state" in f;
    });
    expect(compound).toBeDefined();
  });
});
