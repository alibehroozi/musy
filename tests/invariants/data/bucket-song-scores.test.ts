// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-16.

import { describe, it, expect } from "vitest";
import { BucketSongScoresSchemaDefinition } from "../../../apps/api/src/modules/taste/bucket-song-scores.schema.js";

describe("DATA-16: bucket_song_scores document shape and unique (userId, bucketId, songKey) index", () => {
  it("schema marks userId, bucketId, songKey, snapshot, score, lastUpdatedAt as required", () => {
    const paths = BucketSongScoresSchemaDefinition.paths;
    for (const p of ["userId", "bucketId", "songKey", "snapshot", "score", "lastUpdatedAt"]) {
      const opts = (paths[p] as unknown as { options?: { required?: unknown } }).options;
      expect(opts?.required, `${p} should be required`).toBe(true);
    }
  });

  it("schema declares a unique compound index on (userId, bucketId, songKey)", () => {
    const indexes = BucketSongScoresSchemaDefinition.indexes();
    const unique = indexes.find(([fields]) => {
      const f = fields as Record<string, unknown>;
      return Object.keys(f).length === 3 && "userId" in f && "bucketId" in f && "songKey" in f;
    });
    expect(unique, "(userId, bucketId, songKey) index").toBeDefined();
    const opts = unique![1] as { unique?: boolean };
    expect(opts.unique).toBe(true);
  });

  it("schema declares a compound index on (userId, bucketId, score: -1) for top-N reads", () => {
    const indexes = BucketSongScoresSchemaDefinition.indexes();
    const topN = indexes.find(([fields]) => {
      const f = fields as Record<string, unknown>;
      return Object.keys(f).length === 3 && "userId" in f && "bucketId" in f && f["score"] === -1;
    });
    expect(topN).toBeDefined();
  });

  it("schema constrains score to a number in [0, 100] (integer enforced via validator)", () => {
    const opts = (
      BucketSongScoresSchemaDefinition.paths["score"] as unknown as {
        options?: { min?: unknown; max?: unknown; validate?: unknown };
      }
    ).options;
    expect(opts?.min).toBe(0);
    expect(opts?.max).toBe(100);
    expect(typeof opts?.validate).toBe("function");
    // The validator should accept ints and reject non-ints.
    const validator = opts!.validate as (n: number) => boolean;
    expect(validator(0)).toBe(true);
    expect(validator(50)).toBe(true);
    expect(validator(100)).toBe(true);
    expect(validator(3.14)).toBe(false);
  });
});
