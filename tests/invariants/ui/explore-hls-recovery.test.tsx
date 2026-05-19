// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-39.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";

// hls.js mock: a single class whose instances expose a `fireFatal()` test
// hook. `vi.mock` is hoisted to the top of the file, so the factory
// can't close over file-scope variables — instead we put both the class
// and the shared instances array inside `vi.hoisted`, which evaluates
// before any import is touched.
const { MockHls, hlsInstances } = vi.hoisted(() => {
  type HlsErrorPayload = { fatal: boolean; type?: string; details?: string };
  type HlsHandler = (event: string, data: HlsErrorPayload) => void;

  const instances: MockHls[] = [];

  class MockHls {
    listeners = new Map<string, Set<HlsHandler>>();
    destroyed = false;
    loadedUrl: string | null = null;
    attachedMedia: HTMLAudioElement | null = null;

    constructor() {
      instances.push(this);
    }

    static isSupported(): boolean {
      return true;
    }
    static Events = { ERROR: "hlsError" };

    on(event: string, handler: HlsHandler): void {
      let set = this.listeners.get(event);
      if (!set) {
        set = new Set();
        this.listeners.set(event, set);
      }
      set.add(handler);
    }

    loadSource(url: string): void {
      this.loadedUrl = url;
    }

    attachMedia(media: HTMLAudioElement): void {
      this.attachedMedia = media;
    }

    destroy(): void {
      this.destroyed = true;
      this.listeners.clear();
    }

    // Test hook: pretend the m3u8 manifest 403'd. Fires Hls.Events.ERROR
    // with fatal=true, exactly as hls.js would for an unrecoverable
    // networkError on the manifest.
    fireFatal(): void {
      const set = this.listeners.get(MockHls.Events.ERROR);
      if (!set) return;
      for (const h of set) {
        h(MockHls.Events.ERROR, {
          fatal: true,
          type: "networkError",
          details: "manifestLoadError",
        });
      }
    }

    fireNonFatal(): void {
      const set = this.listeners.get(MockHls.Events.ERROR);
      if (!set) return;
      for (const h of set) {
        h(MockHls.Events.ERROR, {
          fatal: false,
          type: "networkError",
          details: "fragLoadError",
        });
      }
    }
  }

  return { MockHls, hlsInstances: instances };
});

vi.mock("hls.js", () => ({
  default: MockHls,
}));

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

function snapshotKey(s: { title: string; artist: string; durationSec?: number | null }): string {
  return `${s.title.trim().toLowerCase()}|${s.artist.trim().toLowerCase()}|${s.durationSec ?? "?"}`;
}

interface MockAudio {
  audio: HTMLAudioElement;
  fire: (event: string) => void;
  srcHistory: string[];
}

// Same shape as the audio mock in explore-preresolve.test.tsx, but with
// `dispatchEvent` wired through so production code can synthesize an
// "error" event from an hls.js fatal — the production path for UI-39
// is `audio.dispatchEvent(new Event("error"))`.
function installAudioMock(): MockAudio {
  const handlers: Record<string, Set<EventListener>> = {};
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
    addEventListener: vi.fn((event: string, h: EventListener) => {
      (handlers[event] ??= new Set()).add(h);
    }),
    removeEventListener: vi.fn((event: string, h: EventListener) => {
      handlers[event]?.delete(h);
    }),
    dispatchEvent: vi.fn((event: Event): boolean => {
      const set = handlers[event.type];
      if (set) {
        for (const h of set) {
          h(event);
        }
      }
      return true;
    }),
  } as unknown as HTMLAudioElement;
  const fire = (event: string): void => {
    Array.from(handlers[event] ?? []).forEach((h) => (h as () => void)());
  };
  globalThis.Audio = vi.fn(() => audio) as unknown as typeof Audio;
  return { audio, fire, srcHistory };
}

function exploreNextResponse(items: NextResponse["items"]): NextResponse {
  return { items, phase: "discovery", partial: false, buildingQueue: false };
}

interface InstallFetchOpts {
  resolveScripts?: Record<string, Array<{ streamUrl: string | null }>>;
}

function installFetchMock({ resolveScripts = {} }: InstallFetchOpts = {}): {
  fetch: ReturnType<typeof vi.fn>;
  resolveCallCounts: Record<string, number>;
} {
  const callIndex: Record<string, number> = {};
  const resolveCallCounts: Record<string, number> = {};
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
      const key = snap !== undefined ? snapshotKey(snap) : "<unknown>";
      resolveCallCounts[key] = (resolveCallCounts[key] ?? 0) + 1;
      const script = resolveScripts[key];
      let pick: { streamUrl: string | null } = { streamUrl: "https://stream.default/mp3" };
      if (script !== undefined && script.length > 0) {
        const i = callIndex[key] ?? 0;
        pick = script[Math.min(i, script.length - 1)]!;
        callIndex[key] = i + 1;
      }
      return new Response(
        JSON.stringify({
          source: pick.streamUrl === null ? null : "soundcloud",
          sourceTrackId: pick.streamUrl === null ? null : "sc-1",
          streamUrl: pick.streamUrl,
          expiresAt:
            pick.streamUrl === null ? null : new Date(Date.now() + 55 * 60_000).toISOString(),
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
  return { fetch, resolveCallCounts };
}

function renderAuthedApp(): ReturnType<typeof render> {
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

describe("UI-39: hls.js fatal-error propagation as audio 'error' event", () => {
  const originalFetch = globalThis.fetch;
  let audioMock: MockAudio;

  beforeEach(() => {
    cleanup();
    localStorage.setItem("moc.explore.onboarded", "1");
    hlsInstances.length = 0;
    audioMock = installAudioMock();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    globalThis.fetch = originalFetch;
    hlsInstances.length = 0;
    vi.useRealTimers();
  });

  it(
    "when the top card is loaded with an m3u8 URL and the hls.js instance fires a fatal " +
      "ERROR, the engine transitions to failed and UI-21 retries /play/resolve once; the " +
      "retry's fresh (progressive) URL is then loaded into the audio element",
    async () => {
      const KEY_A = snapshotKey(ITEM_A);
      const { resolveCallCounts } = installFetchMock({
        resolveScripts: {
          [KEY_A]: [
            // First resolve: stale signed HLS URL (the one that 403s).
            { streamUrl: "https://cf-hls-media.sndcdn.com/playlist/sig.128.m3u8?Policy=stale" },
            // Retry: fresh progressive MP3 URL.
            { streamUrl: "https://cf-media.sndcdn.com/12345.128.mp3?Policy=fresh" },
          ],
        },
      });

      renderAuthedApp();

      // Wait for ITEM_A to render and the first /play/resolve to fire.
      await screen.findByText("Track A");
      await waitFor(() => expect(resolveCallCounts[KEY_A] ?? 0).toBeGreaterThanOrEqual(1));

      // The audio driver's setSrc with an m3u8 URL constructs an Hls
      // instance — wait for it to appear.
      await waitFor(() => expect(hlsInstances.length).toBeGreaterThanOrEqual(1));
      const hls = hlsInstances[0]!;

      // The m3u8 path uses hls.attachMedia, so audio.src is NOT set
      // directly to the stale URL. srcHistory should not yet contain it.
      expect(audioMock.srcHistory).not.toContain(
        "https://cf-hls-media.sndcdn.com/playlist/sig.128.m3u8?Policy=stale",
      );

      // Production code MUST have registered an Hls.Events.ERROR listener
      // (per UI-39). Firing a fatal error on the instance should propagate
      // through the listener and dispatch an "error" event on the audio
      // element — driving AudioEngine._handleError → engine "failed" →
      // UI-21 retry → second /play/resolve.
      await act(async () => {
        hls.fireFatal();
      });

      // The retry must fire exactly once.
      await waitFor(() => {
        expect(resolveCallCounts[KEY_A]).toBe(2);
      });

      // The fresh (progressive MP3) URL gets set on audio.src via the
      // non-HLS branch of driver.setSrc.
      await waitFor(() => {
        expect(audioMock.srcHistory).toContain(
          "https://cf-media.sndcdn.com/12345.128.mp3?Policy=fresh",
        );
      });
    },
  );

  it(
    "non-fatal hls.js errors (data.fatal === false) MUST NOT propagate to the audio " +
      "element — those are transient segment failures that hls.js auto-recovers from",
    async () => {
      const KEY_A = snapshotKey(ITEM_A);
      const { resolveCallCounts } = installFetchMock({
        resolveScripts: {
          [KEY_A]: [
            { streamUrl: "https://cf-hls-media.sndcdn.com/playlist/sig.128.m3u8?Policy=stale" },
          ],
        },
      });

      renderAuthedApp();
      await screen.findByText("Track A");
      await waitFor(() => expect(resolveCallCounts[KEY_A] ?? 0).toBeGreaterThanOrEqual(1));
      await waitFor(() => expect(hlsInstances.length).toBeGreaterThanOrEqual(1));
      const hls = hlsInstances[0]!;

      // Fire a NON-fatal error: hls.js' own recovery handles it, the
      // engine should stay in its current state (not transition to
      // "failed"), and no retry resolve should fire.
      await act(async () => {
        hls.fireNonFatal();
      });

      // Give any spurious effects a moment to fire.
      await new Promise((r) => setTimeout(r, 60));
      expect(resolveCallCounts[KEY_A]).toBe(1);
    },
  );

  it(
    "the retry latch is one-shot per snapshot: a SECOND fatal hls.js error on the same " +
      "snapshot (e.g. the fresh URL also 403s) does NOT trigger a third /play/resolve",
    async () => {
      const KEY_A = snapshotKey(ITEM_A);
      const { resolveCallCounts } = installFetchMock({
        resolveScripts: {
          [KEY_A]: [
            { streamUrl: "https://cf-hls-media.sndcdn.com/playlist/sig.128.m3u8?Policy=stale" },
            { streamUrl: "https://cf-hls-media.sndcdn.com/playlist/sig.128.m3u8?Policy=alsostale" },
            { streamUrl: "https://stream/should-never-be-fetched" },
          ],
        },
      });

      renderAuthedApp();
      await screen.findByText("Track A");
      await waitFor(() => expect(resolveCallCounts[KEY_A] ?? 0).toBeGreaterThanOrEqual(1));
      await waitFor(() => expect(hlsInstances.length).toBeGreaterThanOrEqual(1));

      // First fatal → retry → second Hls instance for the fresh (still m3u8) URL.
      await act(async () => {
        hlsInstances[0]!.fireFatal();
      });
      await waitFor(() => expect(resolveCallCounts[KEY_A]).toBe(2));
      await waitFor(() => expect(hlsInstances.length).toBeGreaterThanOrEqual(2));

      // Second fatal — latch must hold; no third resolve.
      await act(async () => {
        hlsInstances[1]!.fireFatal();
      });

      await new Promise((r) => setTimeout(r, 80));
      expect(resolveCallCounts[KEY_A]).toBe(2);
    },
  );
});
