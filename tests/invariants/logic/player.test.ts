// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-05 and LOGIC-06.

import { describe, it, expect, vi, afterEach } from "vitest";
import { ZodError } from "zod";
import { AudioEngine, type AudioInterface } from "@moc/web-core";
import { resolveAndPlay } from "@moc/web-core";

const TRACK = {
  title: "Get Lucky",
  artist: "Daft Punk",
  kind: "track" as const,
};

function makeMockAudio() {
  const handlers: Record<string, Set<() => void>> = {};
  const mock: AudioInterface = {
    setSrc: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    currentTime: 0,
    duration: 240,
    seekTo: vi.fn(),
    on: vi.fn((event, cb) => {
      if (!handlers[event]) handlers[event] = new Set();
      handlers[event].add(cb);
      return () => handlers[event]?.delete(cb);
    }),
  };
  const fire = (event: string) => handlers[event]?.forEach((cb) => cb());
  return { mock, fire };
}

describe("LOGIC-05: audio engine is a deterministic state machine exercisable with a mock AudioInterface", () => {
  it("load → playing event → state becomes playing with correct track", () => {
    const { mock, fire } = makeMockAudio();
    const engine = new AudioEngine(mock);

    engine.load(TRACK, "https://stream.example.com/track.mp3", "track-123", "audius");
    expect(engine.state.status).toBe("loading");
    expect("ctx" in engine.state && engine.state.ctx.track).toEqual(TRACK);

    fire("playing");
    expect(engine.state.status).toBe("playing");
    expect("ctx" in engine.state && engine.state.ctx.track).toEqual(TRACK);

    engine.destroy();
  });

  it("load → playing event → ended event → emits completed, state becomes paused", () => {
    const { mock, fire } = makeMockAudio();
    const engine = new AudioEngine(mock);
    const events: string[] = [];

    engine.on((ev) => {
      if (ev.type !== "stateChange") events.push(ev.type);
    });
    engine.load(TRACK, "https://stream.example.com/track.mp3", "track-123", "audius");
    fire("playing");
    fire("ended");

    expect(engine.state.status).toBe("paused");
    expect(events).toContain("started");
    expect(events).toContain("completed");
    engine.destroy();
  });

  it("load → playing event → error event → state becomes failed", () => {
    const { mock, fire } = makeMockAudio();
    const engine = new AudioEngine(mock);

    engine.load(TRACK, "https://stream.example.com/track.mp3", "track-123", "audius");
    fire("playing");
    fire("error");

    expect(engine.state.status).toBe("failed");
    engine.destroy();
  });

  it("load → playing event → togglePlay → state becomes paused; togglePlay again → playing", () => {
    const { mock, fire } = makeMockAudio();
    const engine = new AudioEngine(mock);

    engine.load(TRACK, "https://stream.example.com/track.mp3", "track-123", "audius");
    fire("playing");
    expect(engine.state.status).toBe("playing");

    engine.togglePlay();
    expect(engine.state.status).toBe("paused");

    engine.togglePlay();
    fire("playing");
    expect(engine.state.status).toBe("playing");
    engine.destroy();
  });

  it("load(new track) while loading → new track becomes current", () => {
    const { mock, fire } = makeMockAudio();
    const engine = new AudioEngine(mock);

    const track2 = { title: "Harder Better Faster", artist: "Daft Punk", kind: "track" as const };
    engine.load(TRACK, "https://stream.example.com/t1.mp3", "track-1", "audius");
    engine.load(track2, "https://stream.example.com/t2.mp3", "track-2", "audius");

    fire("playing");
    expect(engine.state.status).toBe("playing");
    expect("ctx" in engine.state && engine.state.ctx.track.title).toBe("Harder Better Faster");
    engine.destroy();
  });

  it("dismiss in failed state → state becomes idle", () => {
    const { mock, fire } = makeMockAudio();
    const engine = new AudioEngine(mock);

    engine.load(TRACK, "https://stream.example.com/track.mp3", "track-123", "audius");
    fire("error");
    expect(engine.state.status).toBe("failed");

    engine.dismiss();
    expect(engine.state.status).toBe("idle");
    engine.destroy();
  });

  it("same event sequence always produces identical (currentTrack, isPlaying, errorState) triple", () => {
    function runSequence() {
      const { mock, fire } = makeMockAudio();
      const engine = new AudioEngine(mock);
      engine.load(TRACK, "https://stream.example.com/track.mp3", "track-123", "audius");
      fire("playing");
      engine.togglePlay();
      const s = engine.state;
      engine.destroy();
      return {
        status: s.status,
        track: "ctx" in s ? s.ctx.track.title : null,
      };
    }

    const run1 = runSequence();
    const run2 = runSequence();
    const run3 = runSequence();
    expect(run1).toEqual(run2);
    expect(run2).toEqual(run3);
  });
});

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("LOGIC-06: resolveAndPlay validates ResolveResponse Zod schema", () => {
  it("throws ZodError when /play/resolve response body does not match the schema", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ invalid: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as typeof globalThis.fetch;

    await expect(
      resolveAndPlay({ title: "Test", artist: "Artist", kind: "track" }),
    ).rejects.toThrow(ZodError);
  });

  it("returns a typed ResolveResponse when the response body matches the schema", async () => {
    const validResponse = {
      source: "audius",
      sourceTrackId: "abc123",
      streamUrl: "https://stream.example.com/track.mp3",
      expiresAt: "2026-01-01T00:00:00.000Z",
    };

    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify(validResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as typeof globalThis.fetch;

    const result = await resolveAndPlay({ title: "Test", artist: "Artist", kind: "track" });
    expect(result.source).toBe("audius");
    expect(result.sourceTrackId).toBe("abc123");
    expect(result.streamUrl).toBe("https://stream.example.com/track.mp3");
  });
});
