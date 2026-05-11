// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-21, UI-22.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent, act } from "@testing-library/react";
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

function snapshotKey(s: { title: string; artist: string; durationSec?: number | null }): string {
  return `${s.title.trim().toLowerCase()}|${s.artist.trim().toLowerCase()}|${s.durationSec ?? "?"}`;
}

const ITEM_A = { title: "Track A", artist: "Artist A", durationSec: 200, kind: "track" as const };
const ITEM_B = { title: "Track B", artist: "Artist B", durationSec: 210, kind: "track" as const };

function exploreNextResponse(items: NextResponse["items"]): NextResponse {
  return { items, phase: "discovery", partial: false, buildingQueue: false };
}

interface InstallFetchOpts {
  next?: NextResponse;
  // Per-snapshot-key list of resolve responses to return in sequence. After the
  // list is exhausted, the last entry is returned for subsequent calls.
  resolveScripts?: Record<string, Array<{ streamUrl: string | null }>>;
  // Default resolve response for any snapshot not explicitly scripted.
  defaultResolve?: { streamUrl: string | null };
  onResolveCall?: (snapshotKey: string) => void;
}

function installFetchMock({
  next = exploreNextResponse([ITEM_A, ITEM_B]),
  resolveScripts = {},
  defaultResolve = { streamUrl: "https://stream/default" },
  onResolveCall,
}: InstallFetchOpts = {}): {
  fetch: ReturnType<typeof vi.fn>;
  resolveCallCounts: Record<string, number>;
} {
  const callIndex: Record<string, number> = {};
  const resolveCallCounts: Record<string, number> = {};
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/explore/next")) {
      return new Response(JSON.stringify(next), {
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
      onResolveCall?.(key);
      resolveCallCounts[key] = (resolveCallCounts[key] ?? 0) + 1;
      const script = resolveScripts[key];
      let pick: { streamUrl: string | null };
      if (script !== undefined && script.length > 0) {
        const i = callIndex[key] ?? 0;
        pick = script[Math.min(i, script.length - 1)]!;
        callIndex[key] = i + 1;
      } else {
        pick = defaultResolve;
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

describe("UI-21: pre-resolved URL failure recovery (retry once via /play/resolve)", () => {
  const originalFetch = globalThis.fetch;
  let audioMock: MockAudio;
  let origRaf: typeof requestAnimationFrame;

  beforeEach(() => {
    cleanup();
    localStorage.setItem("moc.explore.onboarded", "1");
    audioMock = installAudioMock();
    // PlayerProvider's fadeOutAudio runs a 250 ms RAF-based volume fade
    // before every loadPreview/playPreview engine.load. Under jsdom the
    // RAF cadence is too slow for waitFor's default timeout when several
    // fades happen in sequence, so we collapse each frame into a single
    // setTimeout-0 with an artificially-advanced timestamp — the first
    // step() then sees elapsed > durationMs and resolves immediately,
    // making the fade behave as "instant" in tests without changing
    // production behavior.
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
    vi.useRealTimers();
  });

  it(
    "when a loadPreview-loaded top card emits engine.errored before reaching 'playing', " +
      "the FE re-issues POST /api/play/resolve for the same snapshot and re-attempts load with the fresh URL",
    async () => {
      const KEY_B = snapshotKey(ITEM_B);
      const { resolveCallCounts } = installFetchMock({
        resolveScripts: {
          [snapshotKey(ITEM_A)]: [{ streamUrl: "https://stream/A" }],
          [KEY_B]: [
            { streamUrl: "https://stream/B-stale" },
            { streamUrl: "https://stream/B-fresh" },
          ],
        },
      });

      renderAuthedApp();

      // Wait for items to render and the pre-resolve of B to complete.
      await screen.findByText("Track A");
      await waitFor(() => expect(resolveCallCounts[KEY_B] ?? 0).toBe(1));

      // First card (A) becomes top via playPreview. Fire "playing" so it
      // doesn't sit in loading state.
      await act(async () => {
        audioMock.fire("playing");
      });

      // Like → next card B becomes top. Hook sees cached URL_B_STALE and
      // calls loadPreview(B, URL_B_STALE).
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Like" }));
      });

      // Wait for the 250 ms fade-out so audio.src is set to the stale URL.
      await waitFor(() => {
        expect(audioMock.srcHistory).toContain("https://stream/B-stale");
      });

      // The stale URL 403s in the browser.
      await act(async () => {
        audioMock.fire("error");
      });

      // UI-21 effect should re-resolve B once.
      await waitFor(() => {
        expect(resolveCallCounts[KEY_B]).toBe(2);
      });

      // The fresh URL is loaded (after the second fade).
      await waitFor(() => {
        expect(audioMock.srcHistory).toContain("https://stream/B-fresh");
      });
    },
  );

  it("when the retry's /api/play/resolve returns streamUrl: null, the engine reaches the terminal failed state", async () => {
    const KEY_B = snapshotKey(ITEM_B);
    const { resolveCallCounts } = installFetchMock({
      resolveScripts: {
        [snapshotKey(ITEM_A)]: [{ streamUrl: "https://stream/A" }],
        [KEY_B]: [{ streamUrl: "https://stream/B-stale" }, { streamUrl: null }],
      },
    });

    renderAuthedApp();
    await screen.findByText("Track A");
    await waitFor(() => expect(resolveCallCounts[KEY_B] ?? 0).toBe(1));

    await act(async () => {
      audioMock.fire("playing");
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Like" }));
    });

    await waitFor(() => {
      expect(audioMock.srcHistory).toContain("https://stream/B-stale");
    });
    await act(async () => {
      audioMock.fire("error");
    });

    // Retry fires once and returns null → no third resolve call ever.
    await waitFor(() => expect(resolveCallCounts[KEY_B]).toBe(2));
    // Nothing more — the fresh URL was null so no extra load happened.
    expect(audioMock.srcHistory).not.toContain("https://stream/B-fresh");
  });

  it("when the retry's load also errors, the engine reaches the terminal failed state (no infinite retry)", async () => {
    const KEY_B = snapshotKey(ITEM_B);
    const { resolveCallCounts } = installFetchMock({
      resolveScripts: {
        [snapshotKey(ITEM_A)]: [{ streamUrl: "https://stream/A" }],
        [KEY_B]: [
          { streamUrl: "https://stream/B-stale" },
          { streamUrl: "https://stream/B-also-stale" },
        ],
      },
    });

    renderAuthedApp();
    await screen.findByText("Track A");
    await waitFor(() => expect(resolveCallCounts[KEY_B] ?? 0).toBe(1));

    await act(async () => {
      audioMock.fire("playing");
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Like" }));
    });

    await waitFor(() => expect(audioMock.srcHistory).toContain("https://stream/B-stale"));
    await act(async () => {
      audioMock.fire("error");
    });
    await waitFor(() => expect(audioMock.srcHistory).toContain("https://stream/B-also-stale"));

    // Second load errors as well.
    await act(async () => {
      audioMock.fire("error");
    });

    // No third retry — the retried-keys latch holds.
    await new Promise((r) => setTimeout(r, 100));
    expect(resolveCallCounts[KEY_B]).toBe(2);
  });

  it("a successful first load (engine reaches 'playing') does not arm the retry path", async () => {
    const KEY_B = snapshotKey(ITEM_B);
    const { resolveCallCounts } = installFetchMock({
      resolveScripts: {
        [snapshotKey(ITEM_A)]: [{ streamUrl: "https://stream/A" }],
        [KEY_B]: [{ streamUrl: "https://stream/B" }],
      },
    });

    renderAuthedApp();
    await screen.findByText("Track A");
    await waitFor(() => expect(resolveCallCounts[KEY_B] ?? 0).toBe(1));

    await act(async () => {
      audioMock.fire("playing");
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Like" }));
    });

    await waitFor(() => expect(audioMock.srcHistory).toContain("https://stream/B"));

    // B reaches "playing" → retry path is disarmed.
    await act(async () => {
      audioMock.fire("playing");
    });

    // A much later error event (e.g. mid-stream network drop) should not
    // trigger a re-resolve.
    await act(async () => {
      audioMock.fire("error");
    });

    await new Promise((r) => setTimeout(r, 100));
    expect(resolveCallCounts[KEY_B]).toBe(1);
  });
});

describe("UI-22: near-end-of-track refresh of the next-in-queue cached URL", () => {
  const originalFetch = globalThis.fetch;
  let audioMock: MockAudio;
  let origRaf: typeof requestAnimationFrame;

  beforeEach(() => {
    cleanup();
    localStorage.setItem("moc.explore.onboarded", "1");
    audioMock = installAudioMock();
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
    vi.useRealTimers();
  });

  // Drives a "near-end-of-track" tick by setting the mock audio's currentTime
  // and duration and firing timeupdate. The engine reads these via
  // driver.getCurrentTime / getDuration in its _handleTimeUpdate, mirroring
  // them into engineState.progressMs / durationMs.
  function driveNearEndOfTrack(opts: { remainingMs: number; durationMs: number }): void {
    (audioMock.audio as unknown as { currentTime: number; duration: number }).currentTime =
      (opts.durationMs - opts.remainingMs) / 1000;
    (audioMock.audio as unknown as { currentTime: number; duration: number }).duration =
      opts.durationMs / 1000;
    audioMock.fire("timeupdate");
  }

  it("once playableHandoffDecision first flips true for the current track, POST /api/play/resolve fires for the next-in-queue snapshot", async () => {
    const KEY_B = snapshotKey(ITEM_B);
    const { resolveCallCounts } = installFetchMock({
      resolveScripts: {
        [snapshotKey(ITEM_A)]: [{ streamUrl: "https://stream/A" }],
        [KEY_B]: [{ streamUrl: "https://stream/B-old" }, { streamUrl: "https://stream/B-fresh" }],
      },
    });

    renderAuthedApp();
    await screen.findByText("Track A");
    await waitFor(() => expect(resolveCallCounts[KEY_B] ?? 0).toBe(1));

    // A reaches playing.
    await act(async () => {
      audioMock.fire("playing");
    });

    // Way before end-of-track — handoff predicate false → no refresh.
    await act(async () => {
      driveNearEndOfTrack({ remainingMs: 120_000, durationMs: 200_000 });
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(resolveCallCounts[KEY_B]).toBe(1);

    // 4 s remaining < 5 s lookahead → handoff predicate flips → refresh fires.
    await act(async () => {
      driveNearEndOfTrack({ remainingMs: 4_000, durationMs: 200_000 });
    });
    await waitFor(() => expect(resolveCallCounts[KEY_B]).toBe(2));
  });

  it("the refresh fires at most once per (currentSnapshot, nextSnapshot) pair — additional timeupdates within the same near-end window do not re-fire it", async () => {
    const KEY_B = snapshotKey(ITEM_B);
    const { resolveCallCounts } = installFetchMock({
      resolveScripts: {
        [snapshotKey(ITEM_A)]: [{ streamUrl: "https://stream/A" }],
        [KEY_B]: [{ streamUrl: "https://stream/B-old" }, { streamUrl: "https://stream/B-fresh" }],
      },
    });

    renderAuthedApp();
    await screen.findByText("Track A");
    await waitFor(() => expect(resolveCallCounts[KEY_B] ?? 0).toBe(1));

    await act(async () => {
      audioMock.fire("playing");
    });
    await act(async () => {
      driveNearEndOfTrack({ remainingMs: 4_000, durationMs: 200_000 });
    });
    await waitFor(() => expect(resolveCallCounts[KEY_B]).toBe(2));

    // More timeupdates within the near-end window must not re-fire.
    for (const remaining of [3_500, 3_000, 2_500, 2_000, 1_500]) {
      await act(async () => {
        driveNearEndOfTrack({ remainingMs: remaining, durationMs: 200_000 });
      });
    }
    await new Promise((r) => setTimeout(r, 50));
    expect(resolveCallCounts[KEY_B]).toBe(2);
  });

  it("a refresh that returns a fresh URL replaces the existing cache entry for the next-in-queue snapshot", async () => {
    const KEY_B = snapshotKey(ITEM_B);
    const { resolveCallCounts } = installFetchMock({
      resolveScripts: {
        [snapshotKey(ITEM_A)]: [{ streamUrl: "https://stream/A" }],
        [KEY_B]: [{ streamUrl: "https://stream/B-old" }, { streamUrl: "https://stream/B-fresh" }],
      },
    });

    renderAuthedApp();
    await screen.findByText("Track A");
    await waitFor(() => expect(resolveCallCounts[KEY_B] ?? 0).toBe(1));

    await act(async () => {
      audioMock.fire("playing");
    });
    await act(async () => {
      driveNearEndOfTrack({ remainingMs: 4_000, durationMs: 200_000 });
    });
    await waitFor(() => expect(resolveCallCounts[KEY_B]).toBe(2));

    // Swipe to B. Cache should now contain the fresh URL, so loadPreview is
    // called with B-fresh (not B-old).
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Like" }));
    });
    await waitFor(() => expect(audioMock.srcHistory).toContain("https://stream/B-fresh"));
    expect(audioMock.srcHistory).not.toContain("https://stream/B-old");
  });

  it("a refresh that returns streamUrl: null leaves the existing cache entry untouched (silent fallthrough to UI-21 on the next handoff)", async () => {
    const KEY_B = snapshotKey(ITEM_B);
    const { resolveCallCounts } = installFetchMock({
      resolveScripts: {
        [snapshotKey(ITEM_A)]: [{ streamUrl: "https://stream/A" }],
        [KEY_B]: [
          { streamUrl: "https://stream/B-cached" },
          { streamUrl: null },
          // If UI-21 retry fires on the next handoff, this is the URL it gets.
          { streamUrl: "https://stream/B-via-retry" },
        ],
      },
    });

    renderAuthedApp();
    await screen.findByText("Track A");
    await waitFor(() => expect(resolveCallCounts[KEY_B] ?? 0).toBe(1));

    await act(async () => {
      audioMock.fire("playing");
    });
    await act(async () => {
      driveNearEndOfTrack({ remainingMs: 4_000, durationMs: 200_000 });
    });
    // Refresh fires and returns null → the existing cached URL is preserved.
    await waitFor(() => expect(resolveCallCounts[KEY_B]).toBe(2));

    // Swipe to B → cache still has B-cached → loadPreview uses it.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Like" }));
    });
    await waitFor(() => expect(audioMock.srcHistory).toContain("https://stream/B-cached"));
  });

  it("a refresh whose /api/play/resolve fetch rejects does not interrupt the currently-playing track or alter queue order", async () => {
    const KEY_B = snapshotKey(ITEM_B);
    let resolveCallCount = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/explore/next"))
        return new Response(JSON.stringify(exploreNextResponse([ITEM_A, ITEM_B])), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      if (url.includes("/api/explore/profile"))
        return new Response(JSON.stringify(null), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      if (url.includes("/api/explore/swipe")) return new Response(null, { status: 204 });
      if (url.includes("/api/play/resolve")) {
        const body = init?.body !== undefined ? JSON.parse(String(init.body)) : null;
        const key = body?.snapshot ? snapshotKey(body.snapshot) : "";
        if (key === KEY_B) {
          resolveCallCount++;
          if (resolveCallCount === 2) throw new Error("network down");
          return new Response(
            JSON.stringify({
              source: "soundcloud",
              sourceTrackId: "sc-1",
              streamUrl: "https://stream/B-cached",
              expiresAt: new Date(Date.now() + 55 * 60_000).toISOString(),
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            source: "soundcloud",
            sourceTrackId: "sc-1",
            streamUrl: "https://stream/A",
            expiresAt: new Date(Date.now() + 55 * 60_000).toISOString(),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/api/search/history"))
        return new Response(JSON.stringify({ entries: [], nextCursor: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      return new Response("", { status: 404 });
    }) as unknown as typeof globalThis.fetch;

    renderAuthedApp();
    await screen.findByText("Track A");
    await waitFor(() => expect(resolveCallCount).toBe(1));

    await act(async () => {
      audioMock.fire("playing");
    });
    await act(async () => {
      driveNearEndOfTrack({ remainingMs: 4_000, durationMs: 200_000 });
    });

    // Refresh fetch rejects — engine state must not change. Wait for the
    // rejection to be processed, then assert status is still "playing"
    // and Track A is still rendered as top.
    await new Promise((r) => setTimeout(r, 50));
    expect(audioMock.srcHistory[audioMock.srcHistory.length - 1]).toBe("https://stream/A");
    // Top card unchanged — A still at index 0.
    expect(screen.getByText("Track A")).toBeInTheDocument();
  });

  it("swapping the top card (or the next-in-queue snapshot) resets the once-per-pair latch — a subsequent near-end fires a fresh refresh", async () => {
    const ITEM_C = {
      title: "Track C",
      artist: "Artist C",
      durationSec: 220,
      kind: "track" as const,
    };
    const KEY_B = snapshotKey(ITEM_B);
    const KEY_C = snapshotKey(ITEM_C);
    const { resolveCallCounts } = installFetchMock({
      next: exploreNextResponse([ITEM_A, ITEM_B, ITEM_C]),
      resolveScripts: {
        [snapshotKey(ITEM_A)]: [{ streamUrl: "https://stream/A" }],
        [KEY_B]: [{ streamUrl: "https://stream/B-1" }, { streamUrl: "https://stream/B-2" }],
        [KEY_C]: [{ streamUrl: "https://stream/C-1" }, { streamUrl: "https://stream/C-2" }],
      },
    });

    renderAuthedApp();
    await screen.findByText("Track A");
    // Pre-resolve fires for both B and C (PRE_RESOLVE_AHEAD=5).
    await waitFor(() => {
      expect(resolveCallCounts[KEY_B] ?? 0).toBe(1);
      expect(resolveCallCounts[KEY_C] ?? 0).toBe(1);
    });

    // Phase 1 — A is top, B is next. Near-end fires refresh on B.
    await act(async () => {
      audioMock.fire("playing");
    });
    await act(async () => {
      driveNearEndOfTrack({ remainingMs: 4_000, durationMs: 200_000 });
    });
    await waitFor(() => expect(resolveCallCounts[KEY_B]).toBe(2));

    // Swipe → B is top, C is next. (A,B) latched; (B,C) is new.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Like" }));
    });
    // Wait for B's loadPreview to settle.
    await waitFor(() => expect(audioMock.srcHistory).toContain("https://stream/B-2"));
    await act(async () => {
      audioMock.fire("playing");
    });

    // Near-end on B fires a refresh on C (new pair).
    await act(async () => {
      driveNearEndOfTrack({ remainingMs: 4_000, durationMs: 210_000 });
    });
    await waitFor(() => expect(resolveCallCounts[KEY_C]).toBe(2));
  });
});
