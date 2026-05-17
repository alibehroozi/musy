// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-34.
// AI-11 / AI-12 / AI-13 are tested in tests/invariants/ai/auto-bucket.test.ts.

import { describe, it, expect } from "vitest";
import { parseBucketBuilderResponse } from "./bucket-prompt.js";

describe("LOGIC-34: parseBucketBuilderResponse tolerates LLM JSON-wrapper noise (prose, fences, trailing text)", () => {
  it("parses a bare JSON object with newBuckets and assignments", () => {
    const text = JSON.stringify({
      newBuckets: [{ name: "Chill", description: "Relaxed tracks" }],
      assignments: [{ songKey: "snap:abc", bucket: "Chill", initialScore: 72 }],
    });
    const result = parseBucketBuilderResponse(text);
    expect(result.newBuckets).toHaveLength(1);
    expect(result.newBuckets[0]!.name).toBe("Chill");
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0]!.initialScore).toBe(72);
  });

  it("parses when the JSON is wrapped in markdown code fences", () => {
    const text = "```json\n" + JSON.stringify({ newBuckets: [], assignments: [] }) + "\n```";
    const result = parseBucketBuilderResponse(text);
    expect(result.newBuckets).toHaveLength(0);
    expect(result.assignments).toHaveLength(0);
  });

  it("parses when the JSON is surrounded by leading and trailing prose", () => {
    const inner = JSON.stringify({ newBuckets: [], assignments: [] });
    const text = `Here is my classification:\n${inner}\nHope that helps!`;
    const result = parseBucketBuilderResponse(text);
    expect(result.newBuckets).toHaveLength(0);
  });

  it("throws when no JSON object is present in the response", () => {
    expect(() => parseBucketBuilderResponse("I cannot classify these songs.")).toThrow();
  });

  it("throws when the JSON does not match BucketBuilderLLMOutput schema", () => {
    expect(() => parseBucketBuilderResponse(JSON.stringify({ wrong: "shape" }))).toThrow();
  });
});
