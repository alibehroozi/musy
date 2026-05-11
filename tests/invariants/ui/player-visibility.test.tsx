// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-29.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useEffect } from "react";
import {
  PlayerProvider,
  usePlayerContext,
  type PlayerContextValue,
} from "../../../apps/web/src/features/player/PlayerProvider.js";
import { AuthContext, type AuthContextValue } from "../../../apps/web/src/contexts/AuthContext.js";
import type { User, SongSnapshot } from "@moc/contracts";

const TEST_USER: User = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "test@musy.dev",
  googleId: "google-test-1",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const SNAP_A: SongSnapshot = { title: "A", artist: "X", durationSec: 200, kind: "track" };
const SNAP_B: SongSnapshot = { title: "B", artist: "Y", durationSec: 200, kind: "track" };
const URL_A = "https://stream.example/A";
const URL_B = "https://stream.example/B";

interface MockAudio {
  audio: HTMLAudioElement;
  srcHistory: string[];
}

function installAudioMock(): MockAudio {
  let _src = "";
  const srcHistory: string[] = [];
  const audio = {
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    get src() {
      return _src;
    },
    set src(v: string) {
      _src = v;
      srcHistory.push(v);
    },
    currentTime: 0,
    duration: 0,
    volume: 1,
    ended: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as HTMLAudioElement;
  globalThis.Audio = vi.fn(() => audio) as unknown as typeof Audio;
  return { audio, srcHistory };
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
  Object.defineProperty(document, "visibilityState", {
    value: hidden ? "hidden" : "visible",
    configurable: true,
  });
}

function PlayerCapture({
  onReady,
}: {
  onReady: (p: PlayerContextValue) => void;
}): JSX.Element | null {
  const player = usePlayerContext();
  useEffect(() => {
    onReady(player);
  }, [player, onReady]);
  return null;
}

function renderHarness(): {
  audio: HTMLAudioElement;
  srcHistory: string[];
  getPlayer: () => PlayerContextValue;
} {
  const { audio, srcHistory } = installAudioMock();
  let player: PlayerContextValue | null = null;
  const onReady = (p: PlayerContextValue): void => {
    player = p;
  };
  const auth: AuthContextValue = {
    state: { status: "authenticated", user: TEST_USER },
    refresh: async () => {},
  };
  render(
    <AuthContext.Provider value={auth}>
      <PlayerProvider>
        <PlayerCapture onReady={onReady} />
      </PlayerProvider>
    </AuthContext.Provider>,
  );
  return {
    audio,
    srcHistory,
    getPlayer: () => {
      if (player === null) throw new Error("PlayerContext not ready");
      return player;
    },
  };
}

describe("UI-29: audio loading does not depend on requestAnimationFrame", () => {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCaf = globalThis.cancelAnimationFrame;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    cleanup();
    setHidden(false);
    // Simulate iOS lock-screen / suspended-page state: requestAnimationFrame
    // is registered but its callbacks NEVER fire. This is the exact reason
    // for the production bug — Safari pauses RAF when the device is locked,
    // and any code path that gates work behind a RAF-driven Promise stalls
    // until the user unlocks. The fix is that audio loading must not depend
    // on RAF; the test enforces that by stubbing RAF away and asserting the
    // engine still receives the new stream URL.
    globalThis.requestAnimationFrame = vi.fn(() => 0) as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = vi.fn() as unknown as typeof cancelAnimationFrame;
    // playPreview's resolveStream() hits /api/play/resolve. Return the
    // second track's URL so the "press next from lock screen" path can
    // complete end-to-end.
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/play/resolve")) {
        return new Response(
          JSON.stringify({
            source: "soundcloud",
            sourceTrackId: "sc-B",
            streamUrl: URL_B,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("", { status: 404 });
    }) as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    cleanup();
    setHidden(false);
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCaf;
    globalThis.fetch = originalFetch;
  });

  it(
    "loadPreview reaches engine.load(streamUrl) within microtasks when document.hidden=true " +
      "and RAF callbacks never fire (iOS lock-screen `nexttrack`)",
    async () => {
      const { audio, getPlayer } = renderHarness();

      // First load: audio.src starts as "", so fadeOutAudio's existing
      // short-circuit fires synchronously regardless of RAF — the engine
      // gets URL_A on the next microtask. This sets up the "audio is
      // currently loaded" state required to trigger the RAF-fade path on
      // the next call.
      await act(async () => {
        getPlayer().loadPreview(SNAP_A, URL_A);
      });
      await waitFor(() => expect(audio.src).toBe(URL_A));

      // Simulate the iOS lock screen.
      setHidden(true);
      // The previously-loaded track is "currently playing" — restore the
      // volume the engine.load reset to 1 above, since the bug only triggers
      // when fadeOutAudio's volume>0 branch is reached.
      (audio as unknown as { volume: number }).volume = 1;

      // User taps "next" on the lock screen. Explore's nexttrack handler
      // fires onLike → swipe("right") → items re-render → useTopCardPreview
      // calls loadPreview(SNAP_B, URL_B) for the cached-URL fast path.
      // The 250ms RAF-driven crossfade must NOT gate this call.
      await act(async () => {
        getPlayer().loadPreview(SNAP_B, URL_B);
      });

      await waitFor(() => expect(audio.src).toBe(URL_B), { timeout: 500 });
    },
  );

  it(
    "playPreview reaches engine.load(streamUrl) within microtasks when document.hidden=true " +
      "and RAF callbacks never fire (no-cached-URL path)",
    async () => {
      const { audio, getPlayer } = renderHarness();

      await act(async () => {
        getPlayer().loadPreview(SNAP_A, URL_A);
      });
      await waitFor(() => expect(audio.src).toBe(URL_A));

      setHidden(true);
      (audio as unknown as { volume: number }).volume = 1;

      // Same hidden-page state; this time take the playPreview path
      // (no pre-resolved URL — resolveStream() does the round trip).
      await act(async () => {
        getPlayer().playPreview(SNAP_B);
      });

      await waitFor(() => expect(audio.src).toBe(URL_B), { timeout: 500 });
    },
  );
});
