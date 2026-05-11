// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-31.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../../apps/web/src/App.js";
import { AuthContext, type AuthContextValue } from "../../../apps/web/src/contexts/AuthContext.js";
import type { User, NextResponse } from "@moc/contracts";

const TEST_USER: User = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "test@musy.dev",
  googleId: "google-test-1",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const ITEM_A = { title: "Track A", artist: "Artist A", durationSec: 200, kind: "track" as const };
const ITEM_B = { title: "Track B", artist: "Artist B", durationSec: 210, kind: "track" as const };
const URL_A = "https://stream.example/A";
const URL_B = "https://stream.example/B";

function snapshotKey(s: { title: string; artist: string; durationSec?: number | null }): string {
  return `${s.title.trim().toLowerCase()}|${s.artist.trim().toLowerCase()}|${s.durationSec ?? "?"}`;
}

interface MockAudio {
  audio: HTMLAudioElement;
  fire: (event: string) => void;
  srcHistory: string[];
}

function installAudioMock(): MockAudio {
  const handlers: Record<string, Set<() => void>> = {};
  const srcHistory: string[] = [];
  let _src = "";
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
    addEventListener: vi.fn((event: string, h: () => void) => {
      (handlers[event] ??= new Set()).add(h);
    }),
    removeEventListener: vi.fn((event: string, h: () => void) => {
      handlers[event]?.delete(h);
    }),
  } as unknown as HTMLAudioElement;
  const fire = (event: string): void => {
    Array.from(handlers[event] ?? []).forEach((h) => h());
  };
  globalThis.Audio = vi.fn(() => audio) as unknown as typeof Audio;
  return { audio, fire, srcHistory };
}

const ORIGINAL_MEDIA_METADATA = globalThis.MediaMetadata;

function installMediaSessionMock(): {
  actionHandlers: Record<string, (() => void) | null>;
  ms: { metadata: unknown; playbackState: string; setActionHandler: ReturnType<typeof vi.fn> };
} {
  const actionHandlers: Record<string, (() => void) | null> = {};
  const ms = {
    metadata: null as unknown,
    playbackState: "none",
    setActionHandler: vi.fn((action: string, handler: (() => void) | null) => {
      actionHandlers[action] = handler;
    }),
  };
  Object.defineProperty(globalThis.navigator, "mediaSession", {
    value: ms,
    configurable: true,
    writable: true,
  });
  // jsdom doesn't ship MediaMetadata; provide a constructor.
  globalThis.MediaMetadata = class {
    title?: string;
    artist?: string;
    artwork?: { src: string; sizes?: string; type?: string }[];
    constructor(init?: { title?: string; artist?: string; artwork?: unknown[] }) {
      Object.assign(this, init);
    }
  } as unknown as typeof MediaMetadata;
  return { actionHandlers, ms };
}

function exploreNextResponse(items: NextResponse["items"]): NextResponse {
  return { items, phase: "discovery", partial: false, buildingQueue: false };
}

function installFetchMock(): ReturnType<typeof vi.fn> {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/explore/next")) {
      return new Response(JSON.stringify(exploreNextResponse([ITEM_A, ITEM_B])), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/explore/profile")) {
      return new Response(JSON.stringify(null), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/explore/swipe")) return new Response(null, { status: 204 });
    if (url.includes("/api/play/resolve")) {
      const bodyText = init?.body !== undefined ? String(init.body) : "";
      const parsed = bodyText !== "" ? (JSON.parse(bodyText) as { snapshot: typeof ITEM_A }) : null;
      const snap = parsed?.snapshot;
      const k = snap !== undefined ? snapshotKey(snap) : "";
      const streamUrl =
        k === snapshotKey(ITEM_A) ? URL_A : k === snapshotKey(ITEM_B) ? URL_B : null;
      return new Response(
        JSON.stringify({
          source: streamUrl === null ? null : "soundcloud",
          sourceTrackId: streamUrl === null ? null : "sc-x",
          streamUrl,
          expiresAt: streamUrl === null ? null : new Date(Date.now() + 55 * 60_000).toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/api/search/history")) {
      return new Response(JSON.stringify({ entries: [], nextCursor: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("", { status: 404 });
  });
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
  return fetch;
}

function renderAuthedAppOnExplore(): ReturnType<typeof render> {
  const ctxValue: AuthContextValue = {
    state: { status: "authenticated", user: TEST_USER },
    refresh: async () => {},
  };
  return render(
    <AuthContext.Provider value={ctxValue}>
      <MemoryRouter initialEntries={["/explore"]}>
        <App />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("UI-31: Media Session nexttrack/previoustrack handlers load engine synchronously", () => {
  const originalFetch = globalThis.fetch;
  const originalMediaSessionDescriptor = Object.getOwnPropertyDescriptor(
    globalThis.navigator,
    "mediaSession",
  );
  let audioMock: MockAudio;
  let actionHandlers: Record<string, (() => void) | null>;
  // Provide a RAF that fires fast enough during *setup* (so the first
  // track's fade resolves and we can capture the registered handler), but
  // is replaced with a never-firing stub *before* invoking the captured
  // handler — that's the iOS-lock-screen simulation.
  let origRaf: typeof requestAnimationFrame;

  beforeEach(() => {
    cleanup();
    localStorage.setItem("moc.explore.onboarded", "1");
    audioMock = installAudioMock();
    actionHandlers = installMediaSessionMock().actionHandlers;
    installFetchMock();
    origRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      return setTimeout(() => cb(performance.now() + 1_000), 0) as unknown as number;
    }) as typeof requestAnimationFrame;
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    globalThis.fetch = originalFetch;
    globalThis.requestAnimationFrame = origRaf;
    globalThis.MediaMetadata = ORIGINAL_MEDIA_METADATA;
    if (originalMediaSessionDescriptor) {
      Object.defineProperty(globalThis.navigator, "mediaSession", originalMediaSessionDescriptor);
    }
  });

  it(
    "after Track A loads, firing the captured `nexttrack` handler while RAF is suspended " +
      "results in audio.src updating to Track B's pre-resolved URL — proving engine.load ran " +
      "synchronously inside the handler (no React-effect / RAF / fade-.then dependency)",
    async () => {
      renderAuthedAppOnExplore();

      // Wait for ITEM_A to render and become the loaded track.
      await screen.findByText("Track A");
      await waitFor(() => expect(audioMock.srcHistory).toContain(URL_A));

      // Fire the audio `playing` event so the engine status transitions —
      // matches what the explore-preresolve tests do.
      await act(async () => {
        audioMock.fire("playing");
      });

      // ITEM_B should be pre-resolved by useTopCardPreview's lookahead.
      // The captured `nexttrack` handler should be registered (Explore's
      // registerMediaOverrides → PlayerProvider's useMediaSession effect).
      await waitFor(() => {
        expect(actionHandlers["nexttrack"]).toBeTruthy();
      });

      // Simulate iOS lock screen: stub RAF to NEVER fire. The 250 ms
      // fadeOutAudio crossfade would normally queue a RAF; on iOS while
      // locked, RAF is suspended. But the property under test (UI-31) is
      // that the Media Session handler does NOT route through that fade —
      // it calls engine.load synchronously inside the handler.
      globalThis.requestAnimationFrame = vi.fn(() => 0) as unknown as typeof requestAnimationFrame;

      // Fire `nexttrack` exactly as iOS would on a lock-screen tap.
      await act(async () => {
        actionHandlers["nexttrack"]!();
      });

      // With UI-31 satisfied: engine.load(ITEM_B, URL_B) ran inside the
      // handler, audio.src is now URL_B. With UI-31 missing: the chain
      // stalls on the suspended RAF and audio.src is still URL_A.
      expect(audioMock.srcHistory).toContain(URL_B);
    },
  );

  it(
    "after Track A loads, firing the captured `previoustrack` handler while RAF is suspended " +
      "also results in audio.src updating synchronously — the same sync-load guarantee " +
      "applies to prev (= pass / swipe-left in Explore)",
    async () => {
      renderAuthedAppOnExplore();

      await screen.findByText("Track A");
      await waitFor(() => expect(audioMock.srcHistory).toContain(URL_A));
      await act(async () => {
        audioMock.fire("playing");
      });

      await waitFor(() => {
        expect(actionHandlers["previoustrack"]).toBeTruthy();
      });

      globalThis.requestAnimationFrame = vi.fn(() => 0) as unknown as typeof requestAnimationFrame;

      await act(async () => {
        actionHandlers["previoustrack"]!();
      });

      // Prev = pass: same queue advancement to ITEM_B with sync engine.load.
      expect(audioMock.srcHistory).toContain(URL_B);
    },
  );
});
