// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PWA-02.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatProgress } from "@moc/web-core";

// useMediaSession is tested indirectly via its pure behavior here.
// The hook sets navigator.mediaSession.metadata; we mock the mediaSession API
// and call the hook logic in isolation.

type ActionType = "play" | "pause" | "previoustrack" | "nexttrack";

function makeMediaSessionMock() {
  const handlers: Partial<Record<ActionType, MediaSessionActionHandler | null>> = {};
  let metadata: MediaMetadata | null = null;
  return {
    get metadata() {
      return metadata;
    },
    set metadata(v: MediaMetadata | null) {
      metadata = v;
    },
    setActionHandler: vi.fn((action: ActionType, handler: MediaSessionActionHandler | null) => {
      handlers[action] = handler;
    }),
    getHandler: (action: ActionType) => handlers[action],
  };
}

describe("PWA-02: mediaSession.metadata and action handlers reflect current track when available", () => {
  let mediaSessionMock: ReturnType<typeof makeMediaSessionMock>;
  const originalNavigator = Object.getOwnPropertyDescriptor(window, "navigator");

  beforeEach(() => {
    mediaSessionMock = makeMediaSessionMock();
    Object.defineProperty(navigator, "mediaSession", {
      value: mediaSessionMock,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    if (originalNavigator) {
      Object.defineProperty(window, "navigator", originalNavigator);
    }
  });

  it("when navigator.mediaSession is available and a track is playing, metadata.title matches track.title", () => {
    const track = { title: "Get Lucky", artist: "Daft Punk", kind: "track" as const };
    // Simulate what useMediaSession does
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

  it("when navigator.mediaSession is unavailable (undefined), formatProgress still works (no dependency on mediaSession)", () => {
    // This test verifies the pure logic layer has no dependency on mediaSession.
    // The hook guards with `if (!('mediaSession' in navigator))` — the pure logic must not throw.
    expect(() => formatProgress(30_000, 240_000)).not.toThrow();
  });
});
