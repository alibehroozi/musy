import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { fetchJson, HttpError } from "./fetcher.js";

const schema = z.object({ ok: z.boolean() });

describe("fetchJson", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses a 2xx body with the schema", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    await expect(fetchJson("/x", schema)).resolves.toEqual({ ok: true });
  });

  it("throws HttpError carrying status on non-2xx", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({}),
    });
    await expect(fetchJson("/x", schema)).rejects.toMatchObject({
      name: "HttpError",
      status: 401,
    });
    try {
      await fetchJson("/x", schema);
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
    }
  });
});
