// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-11.

import { describe, it, expect } from "vitest";
import { TasteProfilesSchemaDefinition } from "../../../apps/api/src/modules/explore/taste-profile.schema.js";

describe("DATA-11: taste_profiles document shape and unique userId index", () => {
  it("schema marks userId, lastBuiltAt, swipeCountAtLastBuild, summaryText as required", () => {
    const paths = TasteProfilesSchemaDefinition.paths;
    for (const p of ["userId", "lastBuiltAt", "swipeCountAtLastBuild", "summaryText"]) {
      const opts = (paths[p] as unknown as { options?: { required?: unknown } }).options;
      expect(opts?.required, `${p} should be required`).toBe(true);
    }
  });

  it("schema does not impose a maxlength on summaryText (LLM owns the length budget)", () => {
    const opts = (
      TasteProfilesSchemaDefinition.paths["summaryText"] as unknown as {
        options?: { maxlength?: unknown };
      }
    ).options;
    expect(opts?.maxlength).toBeUndefined();
  });

  it("schema declares a unique single-field index on userId", () => {
    const indexes = TasteProfilesSchemaDefinition.indexes();
    const userIdIndex = indexes.find(([fields]) => {
      const f = fields as Record<string, unknown>;
      return Object.keys(f).length === 1 && "userId" in f;
    });
    expect(userIdIndex, "(userId) index").toBeDefined();
    const opts = userIdIndex![1] as { unique?: boolean };
    expect(opts.unique).toBe(true);
  });
});
