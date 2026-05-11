// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-19.
//
// Background: in a cross-origin production deployment (Cloudflare Pages
// web ↔ Cloud Run api) the browser strips cookies from any `fetch` that
// doesn't set `credentials: "include"`. We were shipping with that
// option set on `fetchMe` but missing on every other fetcher, so every
// authenticated route silently 401-ed in production while `/auth/me`
// worked. This test pins the uniform rule.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  searchTracks,
  getSearchHistory,
  resolveStream,
  recordPlayStarted,
  recordPlayCompleted,
  recordExplored,
  recordSaved,
  fetchNext,
  fetchProfile,
  submitSwipe,
} from "@moc/web-core";
import type { SongSnapshot } from "@moc/contracts";

const originalFetch = globalThis.fetch;
let fetchSpy: ReturnType<typeof vi.fn>;

const okJson = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
const noContent = (): Response => new Response(null, { status: 204 });

const snapshot: SongSnapshot = { title: "x", artist: "y", kind: "track" };

beforeEach(() => {
  fetchSpy = vi.fn();
  globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

interface Case {
  name: string;
  response: Response;
  invoke: () => Promise<unknown>;
}

const cases: Case[] = [
  {
    name: "searchTracks",
    response: okJson({ results: [], partial: false, failedProviders: [], cached: false }),
    invoke: () => searchTracks("q"),
  },
  {
    name: "getSearchHistory",
    response: okJson({ entries: [], nextCursor: null }),
    invoke: () => getSearchHistory(),
  },
  {
    name: "resolveStream",
    response: okJson({ source: null, sourceTrackId: null, streamUrl: null, expiresAt: null }),
    invoke: () => resolveStream({ snapshot }),
  },
  {
    name: "recordPlayStarted",
    response: noContent(),
    invoke: () => recordPlayStarted({ source: "audius", externalId: "x", snapshot }),
  },
  {
    name: "recordPlayCompleted",
    response: noContent(),
    invoke: () =>
      recordPlayCompleted({ source: "audius", externalId: "x", snapshot, elapsedMs: 0 }),
  },
  {
    name: "recordExplored",
    response: noContent(),
    invoke: () => recordExplored({ source: "audius", externalId: "x", snapshot }),
  },
  {
    name: "recordSaved",
    response: noContent(),
    invoke: () => recordSaved({ source: "audius", externalId: "x", snapshot }),
  },
  {
    name: "fetchNext",
    response: okJson({ items: [], phase: "discovery", partial: false, buildingQueue: false }),
    invoke: () => fetchNext(5),
  },
  {
    name: "fetchProfile",
    response: okJson(null),
    invoke: () => fetchProfile(),
  },
  {
    name: "submitSwipe",
    response: noContent(),
    invoke: () => submitSwipe(snapshot, "right"),
  },
];

describe("LOGIC-19: every web-core fetcher sends credentials: 'include'", () => {
  for (const c of cases) {
    it(`${c.name} sends credentials: "include"`, async () => {
      fetchSpy.mockResolvedValue(c.response);
      await c.invoke();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(init?.credentials).toBe("include");
    });
  }
});
