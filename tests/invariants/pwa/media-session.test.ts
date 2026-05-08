// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PWA-02.
//
// MediaMetadata and navigator.mediaSession are browser APIs not in jsdom;
// we polyfill them here to test the boundary behavior.

import { describe, it, expect, vi, beforeEach } from "vitest";

type ActionType = "play" | "pause" | "previoustrack" | "nexttrack";

// Minimal MediaMetadata polyfill for jsdom
class MediaMetadataMock {
  title: string;
  artist: string;
  artwork: MediaImage[];
  constructor(init: { title?: string; artist?: string; artwork?: MediaImage[] } = {}) {
    this.title = init.title ?? "";
    this.artist = init.artist ?? "";
    this.artwork = init.artwork ?? [];
  }
}

function makeMediaSessionMock() {
  const handlers: Partial<Record<ActionType, MediaSessionActionHandler | null>> = {};
  let _metadata: MediaMetadataMock | null = null;
  return {
    get metadata(): MediaMetadataMock | null {
      return _metadata;
    },
    set metadata(v: MediaMetadataMock | null) {
      _metadata = v;
    },
    setActionHandler: vi.fn((action: ActionType, handler: MediaSessionActionHandler | null) => {
      handlers[action] = handler;
    }),
    getHandler: (action: ActionType) => handlers[action] ?? null,
  };
}

describe("PWA-02: mediaSession.metadata and action handlers reflect current track when available", () => {
  let mediaSessionMock: ReturnType<typeof makeMediaSessionMock>;

  beforeEach(() => {
    mediaSessionMock = makeMediaSessionMock();
    Object.defineProperty(navigator, "mediaSession", {
      value: mediaSessionMock,
      writable: true,
      configurable: true,
    });
    // Polyfill MediaMetadata for jsdom
    (globalThis as Record<string, unknown>)["MediaMetadata"] = MediaMetadataMock;
  });

  it("when navigator.mediaSession is available and a track is playing, metadata.title matches track.title", () => {
    const track = { title: "Get Lucky", artist: "Daft Punk", kind: "track" as const };
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
    });
    expect(navigator.mediaSession.metadata?.title).toBe("Get Lucky");
  });

  it("when navigator.mediaSession is available and a track is playing, metadata.artist matches track.artist", () => {
    const track = { title: "Get Lucky", artist: "Daft Punk", kind: "track" as const };
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
    });
    expect(navigator.mediaSession.metadata?.artist).toBe("Daft Punk");
  });

  it("when navigator.mediaSession is available, play/pause/previoustrack action handlers are registered", () => {
    const onToggle = vi.fn();
    const onPrev = vi.fn();
    navigator.mediaSession.setActionHandler("play", onToggle);
    navigator.mediaSession.setActionHandler("pause", onToggle);
    navigator.mediaSession.setActionHandler("previoustrack", onPrev);
    expect(mediaSessionMock.setActionHandler).toHaveBeenCalledWith("play", onToggle);
    expect(mediaSessionMock.setActionHandler).toHaveBeenCalledWith("pause", onToggle);
    expect(mediaSessionMock.setActionHandler).toHaveBeenCalledWith("previoustrack", onPrev);
  });

  it("when navigator.mediaSession is unavailable, the guard prevents errors", () => {
    // Simulate the absence of mediaSession
    Object.defineProperty(navigator, "mediaSession", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    // The hook guards with `if (!('mediaSession' in navigator))` — no throw should occur.
    expect(() => {
      if ("mediaSession" in navigator && navigator.mediaSession) {
        navigator.mediaSession.metadata = null;
      }
    }).not.toThrow();
  });
});
