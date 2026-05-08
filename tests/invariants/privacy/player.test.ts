// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PRIVACY-03.

import { describe, it, expect, vi, afterEach } from "vitest";
import { AudioEngine, type AudioInterface } from "@moc/web-core";
import type { SongSnapshot } from "@moc/contracts";

const TRACK: SongSnapshot = {
  title: "Get Lucky",
  artist: "Daft Punk",
  kind: "track",
};

const STREAM_URL = "https://audius.co/v1/tracks/abc123/stream?app_name=musy";

function makeMockAudio() {
  let capturedSrc: string | undefined;
  const mock: AudioInterface = {
    setSrc: vi.fn((src: string) => {
      capturedSrc = src;
    }),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    currentTime: 0,
    duration: 240,
    on: vi.fn(() => () => undefined),
  };
  return { mock, getCapturedSrc: () => capturedSrc };
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("PRIVACY-03: audio-fetch URL originates verbatim from resolver; no user-id query params added", () => {
  it("the streamUrl returned by resolveAndPlay is set verbatim on the audio element with no extra query params", () => {
    const { mock, getCapturedSrc } = makeMockAudio();
    const engine = new AudioEngine(mock);

    // Simulate loading with the exact stream URL from the resolver
    engine.load(TRACK, STREAM_URL, "abc123", "audius");

    const capturedSrc = getCapturedSrc();
    expect(capturedSrc).toBe(STREAM_URL);

    // Verify that no user-identifying query params were appended
    const url = new URL(capturedSrc ?? "");
    expect(url.searchParams.has("userId")).toBe(false);
    expect(url.searchParams.has("user_id")).toBe(false);
    expect(url.searchParams.has("session")).toBe(false);
    expect(url.searchParams.has("token")).toBe(false);

    engine.destroy();
  });
});
