// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-23.

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

const ITEM_A = { title: "Track A", artist: "Artist A", durationSec: 200, kind: "track" as const };
const ITEM_B = { title: "Track B", artist: "Artist B", durationSec: 210, kind: "track" as const };

interface AudioMock {
  audio: HTMLAudioElement;
  fire: (event: string) => void;
  playCalls: () => number;
  srcHistory: string[];
}

function installAudioMock(opts: { playOutcomes: Array<"ok" | "blocked"> }): AudioMock {
  const handlers: Record<string, Set<() => void>> = {};
  const srcHistory: string[] = [];
  let _src = "";
  let playCallCount = 0;
  const audio = {
    play: vi.fn(() => {
      const which = opts.playOutcomes[playCallCount] ?? opts.playOutcomes.at(-1) ?? "ok";
      playCallCount++;
      if (which === "ok") return Promise.resolve(undefined);
      const e = new Error("autoplay blocked");
      e.name = "NotAllowedError";
      return Promise.reject(e);
    }),
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
  return { audio, fire, playCalls: () => playCallCount, srcHistory };
}

function exploreNextResponse(items: NextResponse["items"]): NextResponse {
  return { items, phase: "discovery", partial: false };
}

function installFetchMock(items: NextResponse["items"] = [ITEM_A, ITEM_B]): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/explore/next")) {
      return new Response(JSON.stringify(exploreNextResponse(items)), {
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
      return new Response(
        JSON.stringify({
          source: "soundcloud",
          sourceTrackId: "sc-1",
          streamUrl: "https://stream/x",
          expiresAt: new Date(Date.now() + 55 * 60_000).toISOString(),
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
  }) as unknown as typeof globalThis.fetch;
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

describe("UI-23: first-pointerdown recovery from browser autoplay block", () => {
  const originalFetch = globalThis.fetch;
  let origRaf: typeof requestAnimationFrame;

  beforeEach(() => {
    cleanup();
    localStorage.setItem("moc.explore.onboarded", "1");
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

  it("on initial /explore mount where audio.play() rejects with NotAllowedError, the engine reaches 'paused' and a capture-phase pointerdown listener is attached to document", async () => {
    const m = installAudioMock({ playOutcomes: ["blocked"] });
    installFetchMock();

    const addSpy = vi.spyOn(document, "addEventListener");
    renderAuthedApp();
    await screen.findByText("Track A");
    // Wait for engine.load + play() rejection + engine.handlePlayRejection.
    await waitFor(() => {
      expect(m.playCalls()).toBeGreaterThanOrEqual(1);
    });
    // A pointerdown listener was installed in capture phase.
    await waitFor(() => {
      const pointerdownInstalls = addSpy.mock.calls.filter(
        (c) => c[0] === "pointerdown" && c[2] === true,
      );
      expect(pointerdownInstalls.length).toBeGreaterThanOrEqual(1);
    });
    addSpy.mockRestore();
  });

  it("the next pointerdown anywhere on document calls togglePlay; engine reaches 'playing' on the same track without advancing the queue", async () => {
    // First play() blocked, second succeeds (after user gesture).
    const m = installAudioMock({ playOutcomes: ["blocked", "ok"] });
    installFetchMock();

    renderAuthedApp();
    await screen.findByText("Track A");
    await waitFor(() => expect(m.playCalls()).toBe(1));

    // Fire pointerdown anywhere on the document.
    await act(async () => {
      document.dispatchEvent(new Event("pointerdown"));
    });

    // togglePlay calls audio.play() a second time.
    await waitFor(() => expect(m.playCalls()).toBe(2));

    // The audio fires "playing" → engine status = playing.
    await act(async () => {
      m.fire("playing");
    });

    // Queue did not advance — Track A is still the top card.
    expect(screen.getByText("Track A")).toBeInTheDocument();
  });

  it("after the one-shot listener fires, no further pointerdown auto-resumes", async () => {
    // play blocked once, then succeeds. After playing, simulate a user pause
    // (audio "pause" event) → engine status = paused (via _handlePause).
    // Subsequent pointerdown must NOT call togglePlay.
    const m = installAudioMock({ playOutcomes: ["blocked", "ok"] });
    installFetchMock();

    renderAuthedApp();
    await screen.findByText("Track A");
    await waitFor(() => expect(m.playCalls()).toBe(1));

    // First gesture: resumes via UI-23.
    await act(async () => {
      document.dispatchEvent(new Event("pointerdown"));
    });
    await waitFor(() => expect(m.playCalls()).toBe(2));
    await act(async () => {
      m.fire("playing");
    });
    // User pauses (e.g. taps the play button).
    await act(async () => {
      m.fire("pause");
    });

    const playCountBeforeTap = m.playCalls();
    // A subsequent random pointerdown must NOT auto-resume — this paused
    // state was reached via the user's pause, not via autoplayBlocked.
    await act(async () => {
      document.dispatchEvent(new Event("pointerdown"));
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(m.playCalls()).toBe(playCountBeforeTap);
  });

  it("swiping to the next card (a new engine.load) while in the autoplay-blocked paused state detaches the previous listener", async () => {
    // play blocked once for A; then we swipe — engine.load for B uses
    // the cached pre-resolved URL → play() called again. Outcome "blocked"
    // again would re-arm the listener; "ok" means B plays normally.
    const m = installAudioMock({ playOutcomes: ["blocked", "ok", "ok"] });
    installFetchMock();

    const removeSpy = vi.spyOn(document, "removeEventListener");
    renderAuthedApp();
    await screen.findByText("Track A");
    await waitFor(() => expect(m.playCalls()).toBe(1));

    // Click Like → swipe → next card load → engine.load → status changes
    // away from "paused" → detach.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Like" }));
    });

    await waitFor(() => {
      const pointerdownDetaches = removeSpy.mock.calls.filter(
        (c) => c[0] === "pointerdown" && c[2] === true,
      );
      expect(pointerdownDetaches.length).toBeGreaterThanOrEqual(1);
    });
    removeSpy.mockRestore();
  });

  it("engine 'paused' reached through any path other than autoplayBlocked does NOT install the listener", async () => {
    // play succeeds; then user pauses (audio "pause" event) → engine status
    // = paused. No autoplayBlocked emitted → no pointerdown listener.
    const m = installAudioMock({ playOutcomes: ["ok"] });
    installFetchMock();

    const addSpy = vi.spyOn(document, "addEventListener");
    renderAuthedApp();
    await screen.findByText("Track A");
    await waitFor(() => expect(m.playCalls()).toBe(1));

    await act(async () => {
      m.fire("playing");
    });
    await act(async () => {
      m.fire("pause");
    });

    // No pointerdown listener was ever installed on document.
    const pointerdownInstalls = addSpy.mock.calls.filter(
      (c) => c[0] === "pointerdown" && c[2] === true,
    );
    expect(pointerdownInstalls.length).toBe(0);
    addSpy.mockRestore();
  });
});
