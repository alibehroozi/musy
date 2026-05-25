// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-37, UI-38, UI-41.

import { describe, it, expect, vi, afterEach } from "vitest";

describe("UI-37: /taste/buckets/:bucketId page shell — ready / building / failed", () => {
  it.todo(
    'ready state: h1 with bucket name, "N songs" subtitle (singular at N=1), cover, Play all visible when songs.length >= 1',
  );

  it.todo("ready state: Play all is NOT rendered when songs.length === 0");

  it.todo("ready state: each song row uses the ResultRow component with NO trailing slot rendered");

  it.todo(
    "ready state: song list order is the array order returned by the server (no client re-sort)",
  );

  it.todo('building state: subtitle is the literal text "Building…", no song list, no Play all');

  it.todo(
    'failed state: errorReason text rendered (or "Mix failed to build" when null), no song list, no Play all',
  );

  it.todo(
    "all three states render a single accessible back affordance that navigates to /taste via React Router",
  );

  it.todo(
    "no raw <button>/<input>/<textarea>/<select> in the page — DS components only (AGENTS.md hard rule #14)",
  );
});

describe("UI-38: row tap + Play all wire into PlayerProvider with bucket context", () => {
  it.todo(
    "tapping a song row calls playSnapshot(snapshot, source, externalId, { bucketId, bucketKind })",
  );

  it.todo("source + externalId are derived from the row's songKey via splitSongKey");

  it.todo("tapping Play all enqueues every row in render order and starts playback at index 0");

  it.todo(
    "Play all auto-advance: the engine's 'completed' event loads the next snapshot until the queue drains",
  );

  it.todo(
    "every playSnapshot invocation from this page receives the SAME { bucketId, bucketKind } for the loaded bucket",
  );
});

describe("UI-41: every apps/web taste fetcher routes through api.ts to honor VITE_API_URL", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  // Regression: useBucketDetail used to import fetchBucketDetail directly
  // from @moc/web-core, which defaults its apiBase to "/api". In production
  // VITE_API_URL is set to the absolute Cloud Run URL while the bundle is
  // served from a different Cloudflare Pages origin — so the "/api"
  // relative URL hit the Pages origin, returned the SPA-shell HTML, failed
  // BucketDetailResponse JSON parsing, and the page rendered "Couldn't
  // load this bucket." (the state === "error" branch).
  it("useBucketDetail fetches ${VITE_API_URL}/me/taste/buckets/:id, not the default /api/...", async () => {
    vi.stubEnv("VITE_API_URL", "https://api.test.example");
    vi.resetModules();

    const okBody = {
      bucket: {
        id: "bid-456",
        userId: "u-1",
        name: "X",
        description: null,
        kind: "auto",
        state: "ready",
        promptText: null,
        errorReason: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        lastBuiltAt: "2026-01-01T00:00:00.000Z",
        coverArtworkUrl: null,
      },
      songs: [],
    };
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify(okBody), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(fetchSpy as unknown as typeof fetch);

    const { renderHook, waitFor } = await import("@testing-library/react");
    const { useBucketDetail } =
      await import("../../../apps/web/src/features/taste/useBucketDetail.js");

    renderHook(() => useBucketDetail("bid-456"));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const calledUrl = fetchSpy.mock.calls[0]![0];
    expect(calledUrl).toBe("https://api.test.example/me/taste/buckets/bid-456");
  });

  it("the same VITE_API_URL prefix is honored by the taste-profile fetcher", async () => {
    vi.stubEnv("VITE_API_URL", "https://api.test.example");
    vi.resetModules();

    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ buckets: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(fetchSpy as unknown as typeof fetch);

    const { fetchTasteProfile } = await import("../../../apps/web/src/features/taste/api.js");
    await fetchTasteProfile();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]![0]).toBe("https://api.test.example/me/taste/profile");
  });
});
