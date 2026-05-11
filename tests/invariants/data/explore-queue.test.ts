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
  it("items uses a typed subschema (not Mixed) so per-item paths can be enforced", () => {
    const itemsPath = ExploreQueueSchemaDefinition.paths["items"] as unknown as {
      schema?: { paths?: Record<string, unknown> };
    };
    expect(
      itemsPath.schema?.paths,
      "items must be a DocumentArray with a subschema — not Schema.Types.Mixed",
    ).toBeDefined();
  });

  it("items subschema marks coverUrl as a required field", () => {
    const itemsPath = ExploreQueueSchemaDefinition.paths["items"] as unknown as {
      schema: {
        paths: Record<string, { options?: { required?: unknown } }>;
      };
    };
    const coverUrl = itemsPath.schema.paths["coverUrl"];
    expect(coverUrl, "items subschema must declare coverUrl").toBeDefined();
    expect(coverUrl?.options?.required).toBe(true);
  });

  it("items subschema's coverUrl validator rejects empty strings and accepts non-empty ones", () => {
    const itemsPath = ExploreQueueSchemaDefinition.paths["items"] as unknown as {
      schema: {
        paths: Record<
          string,
          {
            options?: {
              validate?: { validator?: (v: unknown) => boolean };
            };
          }
        >;
      };
    };
    const validator = itemsPath.schema.paths["coverUrl"]?.options?.validate?.validator;
    expect(validator, "items.coverUrl must declare a validator").toBeDefined();
    expect(validator!("")).toBe(false);
    expect(validator!(undefined)).toBe(false);
    expect(validator!(0 as unknown)).toBe(false);
    expect(validator!("https://cdn/cover.jpg")).toBe(true);
  });
});
