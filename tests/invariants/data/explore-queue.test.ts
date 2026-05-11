// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-12, DATA-13.

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

describe("DATA-13: every persisted explore_queue item has a non-empty coverUrl", () => {
  it.todo(
    "QueueBuilderService.rebuildQueue writes only items with non-empty coverUrl — feed the builder a candidate list mixing covered + uncovered snapshots, stub the SearchService resolver to return artwork for some and null for others, then read back the persisted ExploreQueueRepository document and assert every items[i].coverUrl is a non-empty string",
  );

  it.todo(
    "QueueBuilderService.rebuildQueue drops candidates whose resolver returns a TrackResult without artworkUrl — stub the resolver to return a TrackResult with artworkUrl=undefined for a specific snapshot and confirm that snapshot is absent from the persisted queue",
  );

  it.todo(
    "QueueBuilderService.rebuildQueue preserves an existing coverUrl when one is already present on the candidate (no overwrite via resolver) — assert the persisted item's coverUrl matches the input snapshot's coverUrl exactly when the input already had one",
  );
});
