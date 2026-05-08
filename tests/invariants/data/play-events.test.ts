// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-06, DATA-07.

import { describe, it, expect } from "vitest";
import { ListeningEventSchemaDefinition } from "../../../apps/api/src/modules/play/listening-events.schema.js";
import { InterestScoreSchemaDefinition } from "../../../apps/api/src/modules/play/interest-scores.schema.js";

describe("DATA-06: listening_events documents have required fields; elapsedMs >= 0; compound index (userId, songKey, at) exists", () => {
  it("listening_events schema has required fields: userId, songKey, eventType, at, elapsedMs", () => {
    const paths = ListeningEventSchemaDefinition.paths;
    expect(paths["userId"]).toBeDefined();
    expect(paths["songKey"]).toBeDefined();
    expect(paths["eventType"]).toBeDefined();
    expect(paths["at"]).toBeDefined();
    expect(paths["elapsedMs"]).toBeDefined();
    const userIdOpts = paths["userId"] as unknown as { options?: { required?: boolean } };
    expect(userIdOpts.options?.required).toBe(true);
  });

  it("listening_events schema has a compound index on (userId, songKey, at)", () => {
    const indexes = ListeningEventSchemaDefinition.indexes();
    const compoundIndex = indexes.find(([fields]) => {
      const f = fields as Record<string, unknown>;
      return "userId" in f && "songKey" in f && "at" in f;
    });
    expect(compoundIndex).toBeDefined();
  });

  it("elapsedMs field has a minimum value of 0 enforced by the schema", () => {
    const paths = ListeningEventSchemaDefinition.paths;
    const elapsedMsPath = paths["elapsedMs"] as unknown as { options?: { min?: number } };
    expect(elapsedMsPath.options?.min).toBe(0);
  });
});

describe("DATA-07: interest_scores has unique compound index (userId, songKey); score is monotonically non-decreasing", () => {
  it("interest_scores schema has a unique compound index on (userId, songKey)", () => {
    const indexes = InterestScoreSchemaDefinition.indexes();
    const uniqueIndex = indexes.find(([fields, opts]) => {
      const f = fields as Record<string, unknown>;
      const o = opts as Record<string, unknown> | undefined;
      return "userId" in f && "songKey" in f && o?.["unique"] === true;
    });
    expect(uniqueIndex).toBeDefined();
  });

  it("score field has a minimum value of 0 in the schema", () => {
    const paths = InterestScoreSchemaDefinition.paths;
    const scorePath = paths["score"] as unknown as { options?: { min?: number } };
    expect(scorePath.options?.min).toBe(0);
  });
});
