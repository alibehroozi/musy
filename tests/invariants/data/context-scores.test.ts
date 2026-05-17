// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-17.

import { describe, it, expect } from "vitest";
import { ContextScoresSchemaDefinition } from "../../../apps/api/src/modules/taste/context-scores.schema.js";

describe("DATA-17: context_scores document shape and unique (userId, songKey, axis, value) index", () => {
  it("schema marks userId, songKey, axis, value, score, lastEventType, lastEventAt as required", () => {
    const paths = ContextScoresSchemaDefinition.paths;
    for (const p of [
      "userId",
      "songKey",
      "axis",
      "value",
      "score",
      "lastEventType",
      "lastEventAt",
    ]) {
      const opts = (paths[p] as unknown as { options?: { required?: unknown } }).options;
      expect(opts?.required, `${p} should be required`).toBe(true);
    }
  });

  it("schema's axis enum is exactly {'weekday', 'timeOfDay', 'month'}", () => {
    const opts = (
      ContextScoresSchemaDefinition.paths["axis"] as unknown as {
        options?: { enum?: unknown };
      }
    ).options;
    expect(opts?.enum).toEqual(["weekday", "timeOfDay", "month"]);
  });

  it("schema's lastEventType enum is exactly the four event types", () => {
    const opts = (
      ContextScoresSchemaDefinition.paths["lastEventType"] as unknown as {
        options?: { enum?: unknown };
      }
    ).options;
    expect(opts?.enum).toEqual(["right-swipe", "left-swipe", "save", "listen-completed"]);
  });

  it("schema constrains score to an integer in [0, 100]", () => {
    const opts = (
      ContextScoresSchemaDefinition.paths["score"] as unknown as {
        options?: { min?: unknown; max?: unknown; validate?: unknown };
      }
    ).options;
    expect(opts?.min).toBe(0);
    expect(opts?.max).toBe(100);
    expect(typeof opts?.validate).toBe("function");
    const validator = opts!.validate as (n: number) => boolean;
    expect(validator(0)).toBe(true);
    expect(validator(50)).toBe(true);
    expect(validator(100)).toBe(true);
    expect(validator(3.14)).toBe(false);
  });

  it("schema declares a unique compound index on (userId, songKey, axis, value)", () => {
    const indexes = ContextScoresSchemaDefinition.indexes();
    const unique = indexes.find(([fields]) => {
      const f = fields as Record<string, unknown>;
      return (
        Object.keys(f).length === 4 &&
        "userId" in f &&
        "songKey" in f &&
        "axis" in f &&
        "value" in f
      );
    });
    expect(unique, "(userId, songKey, axis, value) index").toBeDefined();
    const opts = unique![1] as { unique?: boolean };
    expect(opts.unique).toBe(true);
  });

  it("schema declares a compound index on (userId, songKey)", () => {
    const indexes = ContextScoresSchemaDefinition.indexes();
    const compound = indexes.find(([fields]) => {
      const f = fields as Record<string, unknown>;
      return Object.keys(f).length === 2 && "userId" in f && "songKey" in f;
    });
    expect(compound).toBeDefined();
  });
});
