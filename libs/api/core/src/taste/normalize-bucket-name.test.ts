// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-35.

import { describe, it, expect } from "vitest";
import { normalizeBucketName } from "./normalize-bucket-name.js";

describe("LOGIC-35: normalizeBucketName is deterministic — trim, single-space, lowercase", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeBucketName("  hello  ")).toBe("hello");
  });

  it("collapses internal whitespace runs to a single space", () => {
    expect(normalizeBucketName("late  night   drives")).toBe("late night drives");
  });

  it("lowercases the result", () => {
    expect(normalizeBucketName("Late Night Drives")).toBe("late night drives");
  });

  it("combines all three transformations", () => {
    expect(normalizeBucketName("  Late  Night  Drives  ")).toBe("late night drives");
  });

  it("'Late Night Drives' and '  late  night  drives  ' normalize to the same string", () => {
    expect(normalizeBucketName("Late Night Drives")).toBe(
      normalizeBucketName("  late  night  drives  "),
    );
  });

  it("empty string input returns empty string — never throws", () => {
    expect(normalizeBucketName("")).toBe("");
  });

  it("single-word names are lowercased and trimmed", () => {
    expect(normalizeBucketName("  Punk  ")).toBe("punk");
  });

  it("already normalized names are returned unchanged", () => {
    expect(normalizeBucketName("late night drives")).toBe("late night drives");
  });

  it("is deterministic — same input always produces same output", () => {
    const a = normalizeBucketName("  Chill Electronic  ");
    const b = normalizeBucketName("  Chill Electronic  ");
    expect(a).toBe(b);
  });
});
