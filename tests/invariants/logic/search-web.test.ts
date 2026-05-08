// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-04.

import { describe, it, expect, vi, afterEach } from "vitest";
import { ZodError } from "zod";
import { searchTracks } from "@moc/web-core";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("LOGIC-04: searchTracks fetcher validates response against SearchResponse Zod schema", () => {
  it("throws ZodError when the response body is missing required fields", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ invalid: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as typeof globalThis.fetch;

    await expect(searchTracks("test")).rejects.toThrow(ZodError);
  });

  it("returns a typed SearchResponse when the response body matches the schema", async () => {
    const validResponse = {
      results: [],
      partial: false,
      failedProviders: [],
      cached: false,
    };

    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify(validResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as typeof globalThis.fetch;

    const result = await searchTracks("test");
    expect(result.results).toEqual([]);
    expect(result.partial).toBe(false);
    expect(result.cached).toBe(false);
    expect(result.failedProviders).toEqual([]);
  });
});
