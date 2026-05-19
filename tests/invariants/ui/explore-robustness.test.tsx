// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under:
//   UI-25 — UI-21 retry's loadPreview gated on top-card stability
//   UI-26 — engine.currentTrack + mediaSession metadata preserved on empty deck
//   UI-27 — cover-art <img> error → token-driven placeholder
//   UI-28 — transient fetchNext error during poll does not clear buildingQueue
//   UI-30 — deck never advances when engine enters "failed" — only user swipes
//           remove cards from /explore

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
  pauseCalls: ReturnType<typeof vi.fn>;
}

function installAudioMock(): MockAudio {
  const handlers: Record<string, Set<() => void>> = {};
  const srcHistory: string[] = [];
  let _src = "";
  const pauseCalls = vi.fn();
  const audio = {
    play: vi.fn().mockResolvedValue(undefined),
    pause: pauseCalls,
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
  return { audio, fire, srcHistory, pauseCalls };
}

function snapshotKey(s: { title: string; artist: string; durationSec?: number | null }): string {
  return `${s.title.trim().toLowerCase()}|${s.artist.trim().toLowerCase()}|${s.durationSec ?? "?"}`;
}

const ITEM_A = {
  title: "Track A",
  artist: "Artist A",
  durationSec: 200,
  kind: "track" as const,
  coverUrl: "https://cdn/cover-A.jpg",
};
const ITEM_B = {
  title: "Track B",
  artist: "Artist B",
  durationSec: 210,
  kind: "track" as const,
  coverUrl: "https://cdn/cover-B.jpg",
};
const ITEM_C = {
  title: "Track C",
  artist: "Artist C",
  durationSec: 220,
  kind: "track" as const,
  coverUrl: "https://cdn/cover-C.jpg",
};

function nextResponse(items: NextResponse["items"], buildingQueue = false): NextResponse {
  return { items, phase: "discovery", partial: false, buildingQueue };
}

interface InstallFetchOpts {
  next?: NextResponse | NextResponse[];
  resolveScripts?: Record<string, Array<{ streamUrl: string | null }>>;
  defaultResolve?: { streamUrl: string | null };
  // If set, the SECOND fetch for this key is deferred until releaseDeferred()
  // is called. Used to put the UI-21 retry into a pending state so the test
  // can swipe / wait before the retry's .then() fires.
  deferResolveForKey?: string;
  nextErrorOnCall?: number; // 1-based; if equal, returns 500
}

interface InstalledFetch {
  fetch: ReturnType<typeof vi.fn>;
  resolveCallCounts: Record<string, number>;
  releaseDeferred: () => boolean;
  nextCallCount: () => number;
}

function installFetchMock({
  next = nextResponse([ITEM_A, ITEM_B]),
  resolveScripts = {},
  defaultResolve = { streamUrl: "https://stream/default" },
  deferResolveForKey,
  nextErrorOnCall,
}: InstallFetchOpts = {}): InstalledFetch {
  const callIndex: Record<string, number> = {};
  const resolveCallCounts: Record<string, number> = {};
  const nextResponses = Array.isArray(next) ? next : [next];
  let nextCalls = 0;
  const deferredQueue: Array<{
    resolve: (value: Response) => void;
    pick: { streamUrl: string | null };
  }> = [];

  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/explore/next")) {
      nextCalls += 1;
      if (nextErrorOnCall === nextCalls) {
        return new Response("upstream blip", { status: 500 });
      }
      const idx = Math.min(nextCalls - 1, nextResponses.length - 1);
      return new Response(JSON.stringify(nextResponses[idx]), {
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
      let pick: { streamUrl: string | null };
      if (script !== undefined && script.length > 0) {
        const i = callIndex[key] ?? 0;
        pick = script[Math.min(i, script.length - 1)]!;
        callIndex[key] = i + 1;
      } else {
        pick = defaultResolve;
      }
      const buildBody = (p: { streamUrl: string | null }): string =>
        JSON.stringify({
          source: p.streamUrl === null ? null : "soundcloud",
          sourceTrackId: p.streamUrl === null ? null : "sc-1",
          streamUrl: p.streamUrl,
          expiresAt: p.streamUrl === null ? null : new Date(Date.now() + 55 * 60_000).toISOString(),
        });
      // Defer if this is the matching key and we've already returned the
      // first response — i.e. this is the UI-21 retry call.
      if (deferResolveForKey === key && resolveCallCounts[key] >= 2) {
        return new Promise<Response>((resolve) => {
          deferredQueue.push({ resolve, pick });
        });
      }
      return new Response(buildBody(pick), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
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
  const releaseDeferred = (): boolean => {
    const entry = deferredQueue.shift();
    if (!entry) return false;
    entry.resolve(
      new Response(
        JSON.stringify({
          source: entry.pick.streamUrl === null ? null : "soundcloud",
          sourceTrackId: entry.pick.streamUrl === null ? null : "sc-1",
          streamUrl: entry.pick.streamUrl,
          expiresAt:
            entry.pick.streamUrl === null ? null : new Date(Date.now() + 55 * 60_000).toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    return true;
  };
  return { fetch, resolveCallCounts, releaseDeferred, nextCallCount: () => nextCalls };
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

function commonBeforeEach(): { audioMock: MockAudio; origRaf: typeof requestAnimationFrame } {
  cleanup();
  localStorage.setItem("moc.explore.onboarded", "1");
  const audioMock = installAudioMock();
  const origRaf = globalThis.requestAnimationFrame;
  // Collapse the 250 ms fade into one tick — same trick as
  // explore-preresolve.test.tsx so chained loadPreviews don't time out.
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    return setTimeout(() => cb(performance.now() + 1_000), 0) as unknown as number;
  }) as typeof requestAnimationFrame;
  return { audioMock, origRaf };
}

function commonAfterEach(origRaf: typeof requestAnimationFrame, originalFetch: typeof fetch): void {
  cleanup();
  localStorage.clear();
  globalThis.fetch = originalFetch;
  globalThis.requestAnimationFrame = origRaf;
  vi.useRealTimers();
}

describe("UI-25: UI-21 retry's loadPreview is gated on top-card stability", () => {
  const originalFetch = globalThis.fetch;
  let audioMock: MockAudio;
  let origRaf: typeof requestAnimationFrame;

  beforeEach(() => {
    ({ audioMock, origRaf } = commonBeforeEach());
  });
  afterEach(() => commonAfterEach(origRaf, originalFetch));

  it("when the UI-21 retry resolves AFTER the user has swiped to the next card, the fresh URL is silently discarded — audio.src never becomes B-RETRY-FRESH", async () => {
    const KEY_A = snapshotKey(ITEM_A);
    const KEY_B = snapshotKey(ITEM_B);
    const KEY_C = snapshotKey(ITEM_C);
    const installed = installFetchMock({
      next: nextResponse([ITEM_A, ITEM_B, ITEM_C]),
      resolveScripts: {
        [KEY_A]: [{ streamUrl: "https://stream/A-initial" }],
        // B's first call (pre-resolve) returns stale; second call (UI-21
        // retry) is deferred, then returns a fresh URL — but the test
        // swipes past B before releasing, so the fresh URL must NOT be
        // loaded onto the audio element.
        [KEY_B]: [
          { streamUrl: "https://stream/B-stale" },
          { streamUrl: "https://stream/B-RETRY-FRESH" },
        ],
        [KEY_C]: [{ streamUrl: "https://stream/C-cached" }],
      },
      deferResolveForKey: KEY_B,
    });

    renderAuthedApp();
    await screen.findByText("Track A");
    // Only items[1] (B) is pre-resolved on mount (PRE_RESOLVE_AHEAD=1).
    // C is resolved later, when it becomes items[1] after the swipe.
    await waitFor(() => {
      expect(installed.resolveCallCounts[KEY_B] ?? 0).toBe(1);
    });
    // A reaches "playing".
    await act(async () => {
      audioMock.fire("playing");
    });

    // Like → B becomes top, loaded via cache (B-stale).
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Like" }));
    });
    await waitFor(() => expect(audioMock.srcHistory).toContain("https://stream/B-stale"));

    // B's audio fires error → UI-21 retry fires (second call for B,
    // deferred until releaseDeferred()).
    await act(async () => {
      audioMock.fire("error");
    });
    await waitFor(() => expect(installed.resolveCallCounts[KEY_B]).toBe(2));

    // While B's retry is pending, the user takes manual control and swipes
    // past B → C becomes top.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pass" }));
    });
    await waitFor(() => expect(audioMock.srcHistory).toContain("https://stream/C-cached"));

    // Release B's deferred retry. Even though the response carries a
    // playable streamUrl, UI-25 says the FE must not load it — B is no
    // longer the top card.
    installed.releaseDeferred();
    // Settle microtasks + the 250 ms fade.
    await new Promise((r) => setTimeout(r, 200));

    // The fresh URL must NOT appear in srcHistory.
    expect(audioMock.srcHistory).not.toContain("https://stream/B-RETRY-FRESH");
    // The current audio source is still C's cached URL.
    expect(audioMock.srcHistory.at(-1)).toBe("https://stream/C-cached");
  });
});

describe("UI-30: deck never advances on engine failure — only user swipes remove cards", () => {
  const originalFetch = globalThis.fetch;
  let audioMock: MockAudio;
  let origRaf: typeof requestAnimationFrame;

  beforeEach(() => {
    ({ audioMock, origRaf } = commonBeforeEach());
  });
  afterEach(() => commonAfterEach(origRaf, originalFetch));

  it("when the initial card is loaded via playPreview (resolve→engine.load path) and the engine errors before reaching 'playing', the FE re-issues POST /api/play/resolve once and re-attempts load — the deck does NOT advance", async () => {
    // ITEM_A is the very first card; it's loaded via playPreview (not the
    // pre-resolved-URL fast path), so the original UI-21 retry was gated
    // out by `loadedViaCacheRef`. UI-21 (broadened) must now retry here.
    const KEY_A = snapshotKey(ITEM_A);
    const installed = installFetchMock({
      next: nextResponse([ITEM_A, ITEM_B]),
      resolveScripts: {
        [KEY_A]: [{ streamUrl: "https://stream/A-stale" }, { streamUrl: "https://stream/A-fresh" }],
        [snapshotKey(ITEM_B)]: [{ streamUrl: "https://stream/B" }],
      },
    });

    renderAuthedApp();
    await screen.findByText("Track A");

    // A becomes top via playPreview — wait for the resolve and audio.src.
    await waitFor(() => expect(installed.resolveCallCounts[KEY_A] ?? 0).toBe(1));
    await waitFor(() => expect(audioMock.srcHistory).toContain("https://stream/A-stale"));

    // The stream 403s in the browser before "playing" fires.
    await act(async () => {
      audioMock.fire("error");
    });

    // Broadened UI-21 retry must fire — second /play/resolve call for A.
    await waitFor(() => expect(installed.resolveCallCounts[KEY_A]).toBe(2));
    // The fresh URL is loaded onto audio.src.
    await waitFor(() => expect(audioMock.srcHistory).toContain("https://stream/A-fresh"));

    // The deck has NOT advanced — Track A is still on top, Track B has not
    // been loaded.
    expect(audioMock.srcHistory).not.toContain("https://stream/B");
    expect(screen.queryByText("Track A")).toBeInTheDocument();
  });

  it("after the UI-21 retry terminally fails (streamUrl: null), 10+ seconds may elapse and the card MUST remain on the deck — no auto-skip", async () => {
    const KEY_A = snapshotKey(ITEM_A);
    const KEY_B = snapshotKey(ITEM_B);
    const installed = installFetchMock({
      next: nextResponse([ITEM_A, ITEM_B, ITEM_C]),
      resolveScripts: {
        [KEY_A]: [{ streamUrl: "https://stream/A" }],
        // First call (pre-resolve) returns stale, retry returns null —
        // i.e. the song is genuinely unavailable. The old behavior fired
        // a 5-second auto-skip after this; UI-30 says it must not.
        [KEY_B]: [{ streamUrl: "https://stream/B-stale" }, { streamUrl: null }],
        [snapshotKey(ITEM_C)]: [{ streamUrl: "https://stream/C" }],
      },
    });

    renderAuthedApp();
    await screen.findByText("Track A");
    await waitFor(() => expect(installed.resolveCallCounts[KEY_B] ?? 0).toBe(1));
    await act(async () => {
      audioMock.fire("playing");
    });

    // Like → B is top (cache fast-path load with stale URL).
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Like" }));
    });
    await waitFor(() => expect(audioMock.srcHistory).toContain("https://stream/B-stale"));

    // B 403s → retry fires → retry returns null. Engine stays in "failed".
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => {
      audioMock.fire("error");
    });
    await waitFor(() => expect(installed.resolveCallCounts[KEY_B]).toBe(2));

    // Count swipe calls baseline (the earlier "Like" was 1).
    const swipeCallsBefore = installed.fetch.mock.calls.filter((c) =>
      String(c[0]).includes("/api/explore/swipe"),
    ).length;

    // 10 seconds elapse — well past the deleted 5-s auto-skip threshold.
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    // Track B is still on the deck — auto-skip did NOT fire.
    expect(screen.queryByText("Track B")).toBeInTheDocument();
    expect(screen.queryByText("Track C")).not.toBeInTheDocument();
    // C's URL was never loaded — the deck did not advance.
    expect(audioMock.srcHistory).not.toContain("https://stream/C");
    // No new /api/explore/swipe POSTs were issued by the FE.
    const swipeCallsAfter = installed.fetch.mock.calls.filter((c) =>
      String(c[0]).includes("/api/explore/swipe"),
    ).length;
    expect(swipeCallsAfter).toBe(swipeCallsBefore);

    vi.useRealTimers();
  });

  it("after the retry's load ALSO errors (the second attempt itself 403s), 10+ seconds may elapse and the card MUST remain on the deck — no auto-skip", async () => {
    const KEY_A = snapshotKey(ITEM_A);
    const KEY_B = snapshotKey(ITEM_B);
    const installed = installFetchMock({
      next: nextResponse([ITEM_A, ITEM_B, ITEM_C]),
      resolveScripts: {
        [KEY_A]: [{ streamUrl: "https://stream/A" }],
        [KEY_B]: [
          { streamUrl: "https://stream/B-stale" },
          { streamUrl: "https://stream/B-also-stale" },
        ],
        [snapshotKey(ITEM_C)]: [{ streamUrl: "https://stream/C" }],
      },
    });

    renderAuthedApp();
    await screen.findByText("Track A");
    await waitFor(() => expect(installed.resolveCallCounts[KEY_B] ?? 0).toBe(1));
    await act(async () => {
      audioMock.fire("playing");
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Like" }));
    });
    await waitFor(() => expect(audioMock.srcHistory).toContain("https://stream/B-stale"));

    vi.useFakeTimers({ shouldAdvanceTime: true });
    // First error → retry fires, loads the second URL.
    await act(async () => {
      audioMock.fire("error");
    });
    await waitFor(() => expect(audioMock.srcHistory).toContain("https://stream/B-also-stale"));

    // Second error → retry latch holds (no third resolve), engine stays
    // in "failed". UI-30 says the card MUST stay.
    await act(async () => {
      audioMock.fire("error");
    });

    const swipeCallsBefore = installed.fetch.mock.calls.filter((c) =>
      String(c[0]).includes("/api/explore/swipe"),
    ).length;

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.queryByText("Track B")).toBeInTheDocument();
    expect(audioMock.srcHistory).not.toContain("https://stream/C");
    const swipeCallsAfter = installed.fetch.mock.calls.filter((c) =>
      String(c[0]).includes("/api/explore/swipe"),
    ).length;
    expect(swipeCallsAfter).toBe(swipeCallsBefore);

    vi.useRealTimers();
  });
});

describe("UI-26: media-session metadata + currentTrack preserved on empty deck", () => {
  const originalFetch = globalThis.fetch;
  let audioMock: MockAudio;
  let origRaf: typeof requestAnimationFrame;

  beforeEach(() => {
    ({ audioMock, origRaf } = commonBeforeEach());
  });
  afterEach(() => commonAfterEach(origRaf, originalFetch));

  it("after the user swipes the last card with buildingQueue=true, audio.pause() is called and audio.src retains the last loaded URL (mediaSession binding preserved)", async () => {
    const KEY_A = snapshotKey(ITEM_A);
    const installed = installFetchMock({
      // Initial: 1 item (so swiping it drains the deck). Refill returns
      // empty + buildingQueue=true so the rebuild-in-progress branch is
      // exercised.
      next: [nextResponse([ITEM_A], true), nextResponse([], true)],
      resolveScripts: { [KEY_A]: [{ streamUrl: "https://stream/A-only" }] },
    });

    renderAuthedApp();
    await screen.findByText("Track A");
    await waitFor(() => expect(installed.resolveCallCounts[KEY_A] ?? 0).toBe(1));
    await waitFor(() => expect(audioMock.srcHistory).toContain("https://stream/A-only"));
    await act(async () => {
      audioMock.fire("playing");
    });

    const pauseCallsBefore = audioMock.pauseCalls.mock.calls.length;

    // Swipe the last card → items becomes [], top=null.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Like" }));
    });

    await waitFor(() => {
      expect(screen.queryByText("Track A")).not.toBeInTheDocument();
    });

    // UI-26: audio was paused so the just-swiped track stops playing audibly.
    expect(audioMock.pauseCalls.mock.calls.length).toBeGreaterThan(pauseCallsBefore);
    // UI-26: audio.src retains A's URL (NOT cleared to "") — engine.currentTrack
    // preserved, mediaSession metadata stays bound to A.
    expect(audioMock.srcHistory.at(-1)).toBe("https://stream/A-only");
  });
});

describe("UI-27: cover-art <img> error falls back to placeholder", () => {
  const originalFetch = globalThis.fetch;
  let origRaf: typeof requestAnimationFrame;

  beforeEach(() => {
    ({ origRaf } = commonBeforeEach());
  });
  afterEach(() => commonAfterEach(origRaf, originalFetch));

  it("firing 'error' on the top card's <img> swaps to the bg-border placeholder and updates aria-label to 'Artwork unavailable'", async () => {
    installFetchMock({
      resolveScripts: {
        [snapshotKey(ITEM_A)]: [{ streamUrl: "https://stream/A" }],
        [snapshotKey(ITEM_B)]: [{ streamUrl: "https://stream/B" }],
      },
    });

    renderAuthedApp();
    await screen.findByText("Track A");

    // CardStack renders behind→top, so the LAST element in DOM order is
    // the top card. Pull the artwork by walking from the top SwipeCard
    // wrapper (data-explore-position="top") rather than picking [0],
    // which would be a behind card.
    const topWrapper = document.querySelector('[data-explore-position="top"]') as HTMLElement;
    expect(topWrapper).not.toBeNull();
    const artwork = topWrapper.querySelector(
      '[data-testid="explore-artwork"]',
    ) as HTMLElement | null;
    expect(artwork).not.toBeNull();
    expect(artwork!.getAttribute("aria-label")).toBe("Track A cover art");
    const img = artwork!.querySelector("img");
    expect(img).not.toBeNull();

    await act(async () => {
      fireEvent.error(img!);
    });

    const topWrapperAfter = document.querySelector('[data-explore-position="top"]') as HTMLElement;
    const artworkAfter = topWrapperAfter.querySelector(
      '[data-testid="explore-artwork"]',
    ) as HTMLElement;
    expect(artworkAfter.querySelector("img")).toBeNull();
    expect(artworkAfter.getAttribute("aria-label")).toBe("Artwork unavailable");
  });
});

describe("UI-28: a transient fetchNext error during a polling refresh does not clear buildingQueue", () => {
  const originalFetch = globalThis.fetch;
  let audioMock: MockAudio;
  let origRaf: typeof requestAnimationFrame;

  beforeEach(() => {
    ({ audioMock, origRaf } = commonBeforeEach());
  });
  afterEach(() => commonAfterEach(origRaf, originalFetch));

  it("a 500 during polling does not stop the poll — a subsequent successful poll lands new items", async () => {
    // Sequence of /api/explore/next responses:
    //   call 1 (initial activate): items=[A], buildingQueue=true → polling armed.
    //   call 2 (refill triggered by swipe-to-zero): items=[], buildingQueue=true.
    //   call 3 (polling tick): 500 — must NOT stop polling.
    //   call 4 (polling tick): items=[B], buildingQueue=false → polling stops.
    const installed = installFetchMock({
      next: [
        nextResponse([ITEM_A], true),
        nextResponse([], true),
        // (Call 3 is overridden by nextErrorOnCall.)
        nextResponse([], true),
        nextResponse([ITEM_B], false),
      ],
      nextErrorOnCall: 3,
      resolveScripts: {
        [snapshotKey(ITEM_A)]: [{ streamUrl: "https://stream/A" }],
        [snapshotKey(ITEM_B)]: [{ streamUrl: "https://stream/B" }],
      },
    });

    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderAuthedApp();
    await screen.findByText("Track A");
    await waitFor(() => expect(installed.nextCallCount()).toBeGreaterThanOrEqual(1));
    await act(async () => {
      audioMock.fire("playing");
    });

    // Swipe the only card → items becomes [], refill fires (call 2).
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Like" }));
    });
    await waitFor(() => expect(installed.nextCallCount()).toBeGreaterThanOrEqual(2));

    // Polling tick (call 3) — 500.
    await act(async () => {
      vi.advanceTimersByTime(5_500);
    });
    await waitFor(() => expect(installed.nextCallCount()).toBeGreaterThanOrEqual(3));

    // Another polling tick (call 4) — success.
    await act(async () => {
      vi.advanceTimersByTime(5_500);
    });
    await waitFor(() => expect(installed.nextCallCount()).toBeGreaterThanOrEqual(4));

    // Track B from call 4 lands on the deck.
    await waitFor(() => expect(screen.queryByText("Track B")).toBeInTheDocument());
    vi.useRealTimers();
  });
});
