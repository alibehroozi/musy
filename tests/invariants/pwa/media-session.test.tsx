// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PWA-02.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useMediaSession } from "../../../apps/web/src/features/player/useMediaSession.js";
import type { SongSnapshot } from "@moc/contracts";

const TRACK: SongSnapshot = {
  title: "Get Lucky",
  artist: "Daft Punk",
  kind: "track",
  coverUrl: "https://cdn.example/get-lucky.png",
};

const TRACK_TWO: SongSnapshot = {
  title: "One More Time",
  artist: "Daft Punk",
  kind: "track",
  coverUrl: "https://cdn.example/one-more-time.png",
};

interface FakeMediaSession {
  metadata: MediaMetadata | null;
  playbackState: MediaSessionPlaybackState;
  setActionHandler: ReturnType<typeof vi.fn>;
}

function fakeMediaSession(): FakeMediaSession {
  return {
    metadata: null,
    playbackState: "none",
    setActionHandler: vi.fn(),
  };
}

function attachMediaSession(ms: FakeMediaSession | null): void {
  if (ms === null) {
    Object.defineProperty(globalThis.navigator, "mediaSession", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    return;
  }
  Object.defineProperty(globalThis.navigator, "mediaSession", {
    value: ms,
    configurable: true,
    writable: true,
  });
}

const ORIGINAL_MEDIA_METADATA = globalThis.MediaMetadata;

beforeEach(() => {
  // jsdom doesn't ship MediaMetadata; install a constructor that captures init.
  globalThis.MediaMetadata = class {
    title?: string;
    artist?: string;
    artwork?: { src: string; sizes?: string; type?: string }[];
    constructor(init?: Partial<MediaMetadata>) {
      Object.assign(this, init);
    }
  } as unknown as typeof MediaMetadata;
});

afterEach(() => {
  globalThis.MediaMetadata = ORIGINAL_MEDIA_METADATA;
});

describe("PWA-02: navigator.mediaSession integration", () => {
  it("when a track is loaded and mediaSession is available, metadata reflects title, artist, artwork", () => {
    const ms = fakeMediaSession();
    attachMediaSession(ms);

    renderHook(() =>
      useMediaSession({
        snapshot: TRACK,
        isPlaying: true,
        onPlayPause: () => {},
        onSkipBack: () => {},
      }),
    );

    expect(ms.metadata).not.toBeNull();
    expect(ms.metadata?.title).toBe("Get Lucky");
    expect(ms.metadata?.artist).toBe("Daft Punk");
    const artwork = ms.metadata?.artwork as { src: string }[] | undefined;
    expect(artwork?.[0]?.src).toBe("https://cdn.example/get-lucky.png");
  });

  it("registers play, pause, and previoustrack action handlers", () => {
    const ms = fakeMediaSession();
    attachMediaSession(ms);

    renderHook(() =>
      useMediaSession({
        snapshot: TRACK,
        isPlaying: true,
        onPlayPause: () => {},
        onSkipBack: () => {},
      }),
    );

    const calledActions = ms.setActionHandler.mock.calls.map((c) => c[0]);
    expect(calledActions).toContain("play");
    expect(calledActions).toContain("pause");
    expect(calledActions).toContain("previoustrack");
  });

  it("rebinds metadata when the current track changes", () => {
    const ms = fakeMediaSession();
    attachMediaSession(ms);

    const { rerender } = renderHook(
      (props: { snapshot: SongSnapshot | null }) =>
        useMediaSession({
          snapshot: props.snapshot,
          isPlaying: true,
          onPlayPause: () => {},
          onSkipBack: () => {},
        }),
      { initialProps: { snapshot: TRACK as SongSnapshot | null } },
    );
    expect(ms.metadata?.title).toBe("Get Lucky");

    act(() => {
      rerender({ snapshot: TRACK_TWO });
    });

    expect(ms.metadata?.title).toBe("One More Time");
    expect(ms.metadata?.artist).toBe("Daft Punk");
  });

  it("does not throw when navigator.mediaSession is undefined (older Safari, jsdom default)", () => {
    attachMediaSession(null);

    expect(() =>
      renderHook(() =>
        useMediaSession({
          snapshot: TRACK,
          isPlaying: true,
          onPlayPause: () => {},
          onSkipBack: () => {},
        }),
      ),
    ).not.toThrow();
  });
});
