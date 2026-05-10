// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PRIVACY-04.

import { describe, it, expect, vi } from "vitest";
import { AudioEngine } from "@moc/web-core";
import type { AudioDriver } from "@moc/web-core";
import type { SongSnapshot } from "@moc/contracts";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const TRACK: SongSnapshot = { title: "Get Lucky", artist: "Daft Punk", kind: "track" };
const STREAM_URL = "https://stream.audius.co/tracks/abc-123/mp3";

function makeMockDriver() {
  const handlers = new Map<string, Set<() => void>>();
  const driver: AudioDriver = {
    setSrc: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    on: vi.fn((event: string, handler: () => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
      return () => handlers.get(event)?.delete(handler);
    }),
    getCurrentTime: vi.fn().mockReturnValue(0),
    getDuration: vi.fn().mockReturnValue(0),
  };
  return { driver };
}

describe("PRIVACY-05: browser audio URL carries no user-identifier query parameters", () => {
  it("the audio engine sets src to the raw streamUrl without modification", () => {
    const { driver } = makeMockDriver();
    const engine = new AudioEngine(driver);

    engine.load(TRACK, STREAM_URL);

    expect(vi.mocked(driver.setSrc)).toHaveBeenCalledWith(STREAM_URL);
    // The exact URL passed to setSrc must equal the streamUrl — no appended params.
    const calledWith = vi.mocked(driver.setSrc).mock.calls[0]![0];
    expect(calledWith).toBe(STREAM_URL);
    expect(new URL(calledWith).searchParams.has("userId")).toBe(false);
    expect(new URL(calledWith).searchParams.has("sessionId")).toBe(false);
    expect(new URL(calledWith).searchParams.has("uid")).toBe(false);
  });

  it("the PlayerProvider feature source files do not append user identifiers to stream URLs", () => {
    const dir = fileURLToPath(new URL("../../../apps/web/src/features/player", import.meta.url));
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));

    for (const file of files) {
      const src = fs.readFileSync(path.join(dir, file), "utf8");
      // The src attribute is only set via engine.load which takes the raw streamUrl.
      // We verify there is no code that appends userId/sessionId to the URL.
      expect(src, `${file} should not append userId to stream URL`).not.toMatch(
        /streamUrl.*userId|userId.*streamUrl/,
      );
      expect(src, `${file} should not append sessionId to stream URL`).not.toMatch(
        /streamUrl.*sessionId|sessionId.*streamUrl/,
      );
    }
  });

  it("the resolveStream fetcher body contains only the snapshot — no userId", async () => {
    const originalFetch = globalThis.fetch;
    let capturedBody: unknown;

    globalThis.fetch = vi.fn(async (_, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({ source: null, sourceTrackId: null, streamUrl: null, expiresAt: null }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof globalThis.fetch;

    const { resolveAndPlay } = await import("@moc/web-core");
    await resolveAndPlay(TRACK);

    globalThis.fetch = originalFetch;

    expect(capturedBody).toEqual({ snapshot: TRACK });
    expect(JSON.stringify(capturedBody)).not.toContain("userId");
    expect(JSON.stringify(capturedBody)).not.toContain("sessionId");
  });
});
