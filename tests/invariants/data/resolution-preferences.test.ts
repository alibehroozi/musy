// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-14.

import { describe, it, expect } from "vitest";
import { ResolutionPreferencesSchemaDefinition } from "../../../apps/api/src/modules/play/resolution-preferences.schema.js";

describe("DATA-14: resolution_preferences collection shape (global, persist-forever, score-ordered)", () => {
  it("has a unique compound index on (snapshotHash, source, sourceTrackId)", () => {
    const indexes = ResolutionPreferencesSchemaDefinition.indexes();
    const compound = indexes.find(([fields, opts]) => {
      const f = fields as Record<string, unknown>;
      const hasAllThree = "snapshotHash" in f && "source" in f && "sourceTrackId" in f;
      const isUnique =
        typeof opts === "object" && opts !== null && (opts as { unique?: boolean }).unique === true;
      return hasAllThree && isUnique;
    });
    expect(compound).toBeDefined();
  });

  it("has NO TTL index — preferences persist forever (vs. play_resolutions / DATA-08)", () => {
    const indexes = ResolutionPreferencesSchemaDefinition.indexes();
    const ttl = indexes.find(
      ([, opts]) =>
        typeof opts === "object" &&
        opts !== null &&
        "expireAfterSeconds" in (opts as Record<string, unknown>),
    );
    expect(ttl).toBeUndefined();
  });

  it("declares snapshotHash as an indexed string path", () => {
    const paths = ResolutionPreferencesSchemaDefinition.paths;
    const hashPath = paths["snapshotHash"];
    expect(hashPath).toBeDefined();
    const opts = (hashPath as unknown as { options?: { index?: boolean; required?: boolean } })
      .options;
    expect(opts?.index).toBe(true);
    expect(opts?.required).toBe(true);
  });

  it("has NO userId field defined anywhere in its paths (preferences are global)", () => {
    const paths = ResolutionPreferencesSchemaDefinition.paths;
    expect(paths["userId"]).toBeUndefined();
  });

  it("score is a number path with a min validator of 1", () => {
    const paths = ResolutionPreferencesSchemaDefinition.paths;
    const score = paths["score"];
    expect(score).toBeDefined();
    const opts = (score as unknown as { options?: { min?: number; required?: boolean } }).options;
    expect(opts?.required).toBe(true);
    expect(opts?.min).toBe(1);
  });

  it("source is restricted to the literal 'soundcloud'", () => {
    const paths = ResolutionPreferencesSchemaDefinition.paths;
    const source = paths["source"];
    expect(source).toBeDefined();
    const opts = (source as unknown as { options?: { enum?: readonly string[] } }).options;
    expect(opts?.enum).toEqual(["soundcloud"]);
  });
});
