// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-10.

import { describe, it, expect } from "vitest";
import { SwipesSchemaDefinition } from "../../../apps/api/src/modules/explore/explore.schema.js";
import { FakeSwipesRepository, makeSnapshot } from "../_helpers/explore-events-test-app.js";

describe("DATA-10: swipes documents have required fields and (userId, at) + (userId, snapshotHash) compound indexes", () => {
  it("schema marks userId, snapshot, snapshotHash, direction, at as required", () => {
    const paths = SwipesSchemaDefinition.paths;
    for (const p of ["userId", "snapshot", "snapshotHash", "direction", "at"]) {
      const opts = (paths[p] as unknown as { options?: { required?: unknown } }).options;
      expect(opts?.required, `${p} should be required`).toBe(true);
    }
  });

  it('schema\'s direction enum is exactly {"right", "left"}', () => {
    const opts = (
      SwipesSchemaDefinition.paths["direction"] as unknown as {
        options?: { enum?: unknown };
      }
    ).options;
    expect(opts?.enum).toEqual(["right", "left"]);
  });

  it("schema declares a compound index on (userId, at)", () => {
    const indexes = SwipesSchemaDefinition.indexes();
    const compound = indexes.find(([fields]) => {
      const f = fields as Record<string, unknown>;
      return Object.keys(f).length === 2 && "userId" in f && "at" in f;
    });
    expect(compound).toBeDefined();
  });

  it("schema declares a compound index on (userId, snapshotHash)", () => {
    const indexes = SwipesSchemaDefinition.indexes();
    const compound = indexes.find(([fields]) => {
      const f = fields as Record<string, unknown>;
      return Object.keys(f).length === 2 && "userId" in f && "snapshotHash" in f;
    });
    expect(compound).toBeDefined();
  });

  it("the collection is append-only — repeating the same right-swipe creates two distinct documents", async () => {
    const repo = new FakeSwipesRepository();
    const userId = "u-aaaa";
    const snapshot = makeSnapshot();
    await repo.record({ userId, snapshot, snapshotHash: "h-1", direction: "right" });
    await repo.record({ userId, snapshot, snapshotHash: "h-1", direction: "right" });
    const swipes = await repo.findSwipesForUser(userId);
    expect(swipes).toHaveLength(2);
    expect(swipes.every((s) => s.direction === "right")).toBe(true);
  });
});
