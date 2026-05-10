// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-12.

import { describe, it, expect } from "vitest";
import { ExploreQueueSchemaDefinition } from "../../../apps/api/src/modules/explore/explore-queue.schema.js";

describe("DATA-12: explore_queue document shape and unique userId index", () => {
  it("schema marks userId, items, phase, generatedAt, swipesSeenAtBuild as required", () => {
    const paths = ExploreQueueSchemaDefinition.paths;
    for (const p of ["userId", "items", "phase", "generatedAt", "swipesSeenAtBuild"]) {
      const opts = (paths[p] as unknown as { options?: { required?: unknown } }).options;
      expect(opts?.required, `${p} should be required`).toBe(true);
    }
  });

  it("schema enforces phase enum {discovery, artist-refinement, personalized}", () => {
    const opts = (
      ExploreQueueSchemaDefinition.paths["phase"] as unknown as {
        options?: { enum?: string[] };
      }
    ).options;
    expect(opts?.enum).toEqual(["discovery", "artist-refinement", "personalized"]);
  });

  it("schema declares a unique single-field index on userId", () => {
    const indexes = ExploreQueueSchemaDefinition.indexes();
    const userIdIndex = indexes.find(([fields]) => {
      const f = fields as Record<string, unknown>;
      return Object.keys(f).length === 1 && "userId" in f;
    });
    expect(userIdIndex, "(userId) index").toBeDefined();
    const opts = userIdIndex![1] as { unique?: boolean };
    expect(opts.unique).toBe(true);
  });
});
