// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-04.

import { describe, it } from "vitest";

describe("LOGIC-04: searchTracks fetcher validates response against SearchResponse Zod schema", () => {
  it.todo("throws ZodError when the response body is missing required fields");
  it.todo("returns a typed SearchResponse when the response body matches the schema");
});
