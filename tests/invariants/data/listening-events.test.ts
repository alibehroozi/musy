// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-09.

import { describe, it, expect } from "vitest";
import { ListeningEventsSchemaDefinition } from "../../../apps/api/src/modules/play/listening-events.schema.js";

describe("DATA-09: listening_events documents have required fields and a (userId, songKey, at) compound index", () => {
  it("schema marks userId, songKey, source, externalId, eventType, elapsedMs, at as required", () => {
    const paths = ListeningEventsSchemaDefinition.paths;
    const requiredPaths = [
      "userId",
      "songKey",
      "source",
      "externalId",
      "eventType",
      "elapsedMs",
      "at",
    ];
    for (const p of requiredPaths) {
      const opts = (paths[p] as unknown as { options?: { required?: unknown } }).options;
      expect(opts?.required, `${p} should be required`).toBe(true);
    }
  });

  it('schema\'s eventType enum is exactly {"started", "completed"}', () => {
    const opts = (
      ListeningEventsSchemaDefinition.paths["eventType"] as unknown as {
        options?: { enum?: unknown };
      }
    ).options;
    expect(opts?.enum).toEqual(["started", "completed"]);
  });

  it("schema enforces elapsedMs >= 0 (min 0)", () => {
    const opts = (
      ListeningEventsSchemaDefinition.paths["elapsedMs"] as unknown as {
        options?: { min?: unknown };
      }
    ).options;
    expect(opts?.min).toBe(0);
  });

  it("schema declares a compound index on (userId, songKey, at)", () => {
    const indexes = ListeningEventsSchemaDefinition.indexes();
    const compound = indexes.find(([fields]) => {
      const f = fields as Record<string, unknown>;
      return "userId" in f && "songKey" in f && "at" in f;
    });
    expect(compound).toBeDefined();
  });
});
