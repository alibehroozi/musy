// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-32.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  PlayerProvider,
  usePlayerContext,
  type PlayerContextValue,
} from "../../../apps/web/src/features/player/PlayerProvider.js";
import { AuthContext, type AuthContextValue } from "../../../apps/web/src/contexts/AuthContext.js";
import { BadRemixButton } from "../../../apps/web/src/features/player/components/BadRemixButton.js";
import { NowPlayingOverlay } from "../../../apps/web/src/features/player/NowPlayingOverlay.js";
import type { User, SongSnapshot } from "@moc/contracts";
import { useEffect } from "react";

const TEST_USER: User = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "test@musy.dev",
  googleId: "google-test-1",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const SNAP: SongSnapshot = {
  title: "Bad Remix Test Song",
  artist: "Unit Tester",
  durationSec: 200,
  kind: "track",
};

const RERESOLVE_OK = {
  source: "soundcloud",
  sourceTrackId: "sc-fresh",
  streamUrl: "https://stream.example/sc-fresh.mp3",
  expiresAt: "2026-12-31T00:00:00.000Z",
};

function installAudioMock(): { audio: HTMLAudioElement; srcHistory: string[] } {
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

function mockFetch(): ReturnType<typeof vi.fn> {
  const fetchSpy = vi.fn(async (url: unknown) => {
    const u = String(url);
    if (u.includes("/play/reresolve")) {
      return new Response(JSON.stringify(RERESOLVE_OK), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (u.includes("/play/resolve")) {
      return new Response(JSON.stringify(RERESOLVE_OK), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
  globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
  return fetchSpy;
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

function renderWith(children: JSX.Element): { getPlayer: () => PlayerContextValue } {
  let player: PlayerContextValue | null = null;
  const auth: AuthContextValue = {
    state: { status: "authenticated", user: TEST_USER },
    refresh: async () => {},
  };
  render(
    <AuthContext.Provider value={auth}>
      <PlayerProvider>
        <PlayerCapture
          onReady={(p) => {
            player = p;
          }}
        />
        {children}
      </PlayerProvider>
    </AuthContext.Provider>,
  );
  return {
    getPlayer: () => {
      if (player === null) throw new Error("Player context not ready");
      return player;
    },
  };
}

describe("UI-32: Bad Remix button is present on Explore card cover AND Now Playing overlay; click preserves the active snapshot", () => {
  beforeEach(() => {
    cleanup();
    installAudioMock();
  });
  afterEach(() => {
    cleanup();
  });

  it("renders a button with accessible name 'Bad remix' when used standalone (Explore card cover)", () => {
    mockFetch();
    renderWith(<BadRemixButton snapshot={SNAP} />);
    expect(screen.getByRole("button", { name: /bad remix/i })).toBeInTheDocument();
  });

  it("renders a button with accessible name 'Bad remix' inside the Now Playing overlay", async () => {
    mockFetch();
    const { getPlayer } = renderWith(<NowPlayingOverlay />);
    // Surface the now-playing overlay by feeding the player a snapshot the
    // same way the production code paths do, then expand.
    act(() => {
      getPlayer().playSnapshot(SNAP, "soundcloud", "sc-current");
    });
    act(() => {
      getPlayer().expand();
    });
    await waitFor(() => {
      expect(screen.getByTestId("now-playing-overlay")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /bad remix/i })).toBeInTheDocument();
  });

  it("clicking with a known currentSourceTrackId posts to /play/reresolve and triggers loadPreview with the SAME snapshot reference", async () => {
    const fetchSpy = mockFetch();
    const { getPlayer } = renderWith(
      <BadRemixButton snapshot={SNAP} currentSourceTrackId="sc-current" />,
    );

    fireEvent.click(screen.getByRole("button", { name: /bad remix/i }));

    await waitFor(() => {
      const calls = fetchSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes("/play/reresolve"))).toBe(true);
    });
    // UI-32: the active snapshot reference survives the network round-trip
    // (loadPreview swapped only the underlying stream URL).
    await waitFor(() => {
      const state = getPlayer().engineState;
      expect(state.currentTrack).not.toBeNull();
      expect(state.currentTrack?.snapshot).toBe(SNAP);
      expect(state.currentTrack?.streamUrl).toBe(RERESOLVE_OK.streamUrl);
    });
  });

  it("when currentSourceTrackId is undefined, calls /play/resolve first then /play/reresolve (Explore-card path)", async () => {
    const fetchSpy = mockFetch();
    renderWith(<BadRemixButton snapshot={SNAP} />);

    fireEvent.click(screen.getByRole("button", { name: /bad remix/i }));

    await waitFor(() => {
      const calls = fetchSpy.mock.calls.map((c) => String(c[0]));
      const resolveCallIdx = calls.findIndex(
        (u) => u.includes("/play/resolve") && !u.includes("/play/reresolve"),
      );
      const reresolveCallIdx = calls.findIndex((u) => u.includes("/play/reresolve"));
      expect(resolveCallIdx).toBeGreaterThanOrEqual(0);
      expect(reresolveCallIdx).toBeGreaterThan(resolveCallIdx);
    });
  });

  it("the rendered button is a design-system Button (no raw <button> reach in BadRemixButton.tsx source)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "apps/web/src/features/player/components/BadRemixButton.tsx"),
      "utf8",
    );
    // Hard rule #14: no raw <button> in apps/web/. The component must compose
    // the design-system Button instead.
    expect(src).not.toMatch(/<button[\s>]/);
    expect(src).toContain('from "@moc/design-system"');
    expect(src).toContain("Button");
    expect(src).toContain('name="thumbs-down"');
  });
});
