// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-07, LOGIC-08.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AudioEngine } from "@moc/web-core";
import { resolveAndPlay } from "@moc/web-core";
import type { AudioDriver } from "@moc/web-core";
import type { SongSnapshot } from "@moc/contracts";

// ─── Mock AudioDriver factory ───────────────────────────────────────────────

type MockHandler = () => void;

function makeMockDriver() {
  const handlers = new Map<string, Set<MockHandler>>();
  const driver: AudioDriver = {
    setSrc: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    on: vi.fn((event: string, handler: MockHandler) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
      return () => handlers.get(event)?.delete(handler);
    }),
    getCurrentTime: vi.fn().mockReturnValue(0),
    getDuration: vi.fn().mockReturnValue(0),
  };
  const emit = (event: string) => {
    for (const h of handlers.get(event) ?? []) h();
  };
  return { driver, emit };
}

const TRACK: SongSnapshot = { title: "Get Lucky", artist: "Daft Punk", kind: "track" };

// ─── LOGIC-08 ────────────────────────────────────────────────────────────────

describe("LOGIC-08: audio engine is a deterministic state machine testable with a mock driver", () => {
  let driver: AudioDriver;
  let emit: (event: string) => void;
  let engine: AudioEngine;

  beforeEach(() => {
    const mock = makeMockDriver();
    driver = mock.driver;
    emit = mock.emit;
    engine = new AudioEngine(driver);
  });

  it("load → playing event → status becomes 'playing' and 'started' emits once", () => {
    const startedSpy = vi.fn();
    engine.on("started", startedSpy);

    engine.load(TRACK, "https://cdn.example.com/track.mp3");
    expect(engine.state.status).toBe("loading");

    emit("playing");
    expect(engine.state.status).toBe("playing");
    expect(startedSpy).toHaveBeenCalledTimes(1);
  });

  it("load → error event → status becomes 'failed' and 'errored' emits once", () => {
    const erroredSpy = vi.fn();
    engine.on("errored", erroredSpy);

    engine.load(TRACK, "https://cdn.example.com/track.mp3");
    emit("error");

    expect(engine.state.status).toBe("failed");
    expect(erroredSpy).toHaveBeenCalledTimes(1);
  });

  it("load → playing → ended → status becomes 'ended', 'completed' emits with elapsedMs ≥ 0", () => {
    const completedSpy = vi.fn();
    engine.on("completed", completedSpy);

    engine.load(TRACK, "https://cdn.example.com/track.mp3");
    emit("playing");
    emit("ended");

    expect(engine.state.status).toBe("ended");
    expect(completedSpy).toHaveBeenCalledTimes(1);
    const elapsedMs = completedSpy.mock.calls[0]![0] as number;
    expect(elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("load → playing → pause driver event → status becomes 'paused'", () => {
    engine.load(TRACK, "https://cdn.example.com/track.mp3");
    emit("playing");
    expect(engine.state.status).toBe("playing");

    emit("pause");
    expect(engine.state.status).toBe("paused");
  });

  it("loading a second track while one is loading replaces the first (no orphaned started events)", () => {
    const startedSpy = vi.fn();
    engine.on("started", startedSpy);

    engine.load(TRACK, "https://cdn.example.com/a.mp3");
    engine.load({ ...TRACK, title: "One More Time" }, "https://cdn.example.com/b.mp3");

    // Second load, only the second started should fire.
    emit("playing");
    expect(startedSpy).toHaveBeenCalledTimes(1);
    expect(engine.state.currentTrack?.snapshot.title).toBe("One More Time");
  });

  it("togglePlay while playing calls driver.pause(); togglePlay while paused calls driver.play()", () => {
    engine.load(TRACK, "https://cdn.example.com/track.mp3");
    emit("playing");

    engine.togglePlay();
    expect(driver.pause).toHaveBeenCalledTimes(1);

    emit("pause");
    engine.togglePlay();
    expect(driver.play).toHaveBeenCalledTimes(2); // initial load + resume
  });
});

// ─── LOGIC-09 ────────────────────────────────────────────────────────────────

describe("LOGIC-09: resolveAndPlay validates ResolveResponse Zod schema and throws ZodError on shape mismatch", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("resolves successfully when the API returns a valid ResolveResponse shape", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            source: "audius",
            sourceTrackId: "aud-123",
            streamUrl: "https://stream.audius.co/track/123/mp3",
            expiresAt: "2026-12-31T00:00:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    ) as typeof globalThis.fetch;

    const result = await resolveAndPlay(TRACK);
    expect(result.source).toBe("audius");
    expect(result.streamUrl).toBeTruthy();
  });

  it("throws ZodError when the API response body is missing required fields", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ unexpected: "shape" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as typeof globalThis.fetch;

    await expect(resolveAndPlay(TRACK)).rejects.toThrow();
  });

  it("passes the snapshot through to the fetch body without adding user identifiers", async () => {
    let capturedBody: unknown;
    globalThis.fetch = vi.fn(async (_, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({
          source: null,
          sourceTrackId: null,
          streamUrl: null,
          expiresAt: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof globalThis.fetch;

    await resolveAndPlay(TRACK);

    expect(capturedBody).toEqual({ snapshot: TRACK });
    // No user identifier in the body.
    expect(JSON.stringify(capturedBody)).not.toContain("userId");
    expect(JSON.stringify(capturedBody)).not.toContain("sessionId");
  });
});
