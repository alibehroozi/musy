import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ZodError } from "zod";
import type { NextResponse, TasteProfileResponse, SongSnapshot } from "@moc/contracts";
import { fetchNext, fetchProfile, submitSwipe } from "./explore-fetcher.js";
import { HttpError } from "../fetcher.js";

const SNAPSHOT: SongSnapshot = {
  title: "Get Lucky",
  artist: "Daft Punk",
  durationSec: 369,
  kind: "track",
};

const VALID_NEXT: NextResponse = {
  items: [SNAPSHOT],
  phase: "discovery",
  partial: false,
  buildingQueue: false,
};

const VALID_PROFILE: TasteProfileResponse = null;

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchNext", () => {
  it("clamps count to [1, 50] and parses a valid response", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify(VALID_NEXT), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof globalThis.fetch;

    const out = await fetchNext(20, "/api");
    expect(out).toEqual(VALID_NEXT);
    expect(calls[0]).toBe("/api/explore/next?count=20");

    await fetchNext(0, "/api");
    expect(calls[1]).toBe("/api/explore/next?count=1");

    await fetchNext(999, "/api");
    expect(calls[2]).toBe("/api/explore/next?count=50");
  });

  it("throws ZodError when the response body does not match NextResponse", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ items: "nope" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as typeof globalThis.fetch;

    await expect(fetchNext(20, "/api")).rejects.toBeInstanceOf(ZodError);
  });

  it("throws HttpError on non-2xx", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: "X", message: "y" } }), {
          status: 401,
          statusText: "Unauthorized",
        }),
    ) as typeof globalThis.fetch;

    await expect(fetchNext(20, "/api")).rejects.toBeInstanceOf(HttpError);
  });
});

describe("fetchProfile", () => {
  it("returns null when the user is below the build threshold", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify(VALID_PROFILE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as typeof globalThis.fetch;

    const out = await fetchProfile("/api");
    expect(out).toBe(null);
  });

  it("throws ZodError when the response body does not match TasteProfileResponse", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ wrong: "shape" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as typeof globalThis.fetch;

    await expect(fetchProfile("/api")).rejects.toBeInstanceOf(ZodError);
  });
});

describe("submitSwipe", () => {
  it("posts to /api/explore/swipe with a SwipeRequest body", async () => {
    let bodySeen: unknown = null;
    globalThis.fetch = vi.fn(async (_url, init) => {
      bodySeen = JSON.parse(String(init?.body ?? "null"));
      return new Response(null, { status: 204 });
    }) as typeof globalThis.fetch;

    await submitSwipe(SNAPSHOT, "right", "/api");
    expect(bodySeen).toEqual({ snapshot: SNAPSHOT, direction: "right" });
  });

  it("throws ZodError when given an invalid SwipeRequest body before the network call fires", async () => {
    let called = false;
    globalThis.fetch = vi.fn(async () => {
      called = true;
      return new Response(null, { status: 204 });
    }) as typeof globalThis.fetch;

    // Direction "up" is not in the SwipeDirection enum.
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      submitSwipe(SNAPSHOT, "up" as any, "/api"),
    ).rejects.toBeInstanceOf(ZodError);
    expect(called).toBe(false);
  });

  it("throws HttpError on non-2xx", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: "X", message: "y" } }), {
          status: 401,
          statusText: "Unauthorized",
        }),
    ) as typeof globalThis.fetch;

    await expect(submitSwipe(SNAPSHOT, "left", "/api")).rejects.toBeInstanceOf(HttpError);
  });
});
