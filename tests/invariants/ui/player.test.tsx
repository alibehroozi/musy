// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-11, UI-12, UI-13.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../../apps/web/src/App.js";
import { AuthContext, type AuthContextValue } from "../../../apps/web/src/contexts/AuthContext.js";
import type { User } from "@moc/contracts";

// ─── Mock HTMLAudioElement ────────────────────────────────────────────────────

const TEST_USER: User = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "test@musy.dev",
  googleId: "google-test-1",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function mockAudio() {
  const mockEl = {
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    src: "",
    currentTime: 0,
    duration: 0,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  globalThis.Audio = vi.fn(() => mockEl) as unknown as typeof Audio;
  return mockEl;
}

function mockFetchResponses({
  historyEmpty = true,
  searchResults = TRACK_RESPONSE,
  resolveResult = RESOLVE_WITH_STREAM,
}: {
  historyEmpty?: boolean;
  searchResults?: object;
  resolveResult?: object;
} = {}) {
  globalThis.fetch = vi.fn(async (url: unknown) => {
    const u = url as string;
    if (u.includes("/search/history")) {
      return new Response(
        JSON.stringify(
          historyEmpty ? { entries: [], nextCursor: null } : { entries: [], nextCursor: null },
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (u.includes("/search/explored") || u.includes("/search/saved")) {
      return new Response(null, { status: 204 });
    }
    if (u.includes("/play/resolve")) {
      return new Response(JSON.stringify(resolveResult), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (u.includes("/play/started") || u.includes("/play/completed")) {
      return new Response(null, { status: 204 });
    }
    if (u.includes("/api/search")) {
      return new Response(JSON.stringify(searchResults), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as typeof globalThis.fetch;
}

const TRACK_RESPONSE = {
  results: [
    {
      type: "track",
      id: "audius:track:1",
      title: "Get Lucky",
      artist: "Daft Punk",
      provider: "audius",
      providerId: "audius-1",
      sources: ["audius"],
    },
    {
      type: "track",
      id: "deezer:track:2",
      title: "One More Time",
      artist: "Daft Punk",
      provider: "deezer",
      providerId: "deezer-2",
      sources: ["deezer"],
    },
  ],
  partial: false,
  failedProviders: [],
  cached: false,
};

const RESOLVE_WITH_STREAM = {
  source: "audius",
  sourceTrackId: "audius-1",
  streamUrl: "https://stream.audius.co/tracks/audius-1/mp3",
  expiresAt: "2026-12-31T00:00:00.000Z",
};

const RESOLVE_NULL = {
  source: null,
  sourceTrackId: null,
  streamUrl: null,
  expiresAt: null,
};

function renderAuthedApp(initialPath = "/search") {
  const ctxValue: AuthContextValue = {
    state: { status: "authenticated", user: TEST_USER },
    refresh: async () => {},
  };
  return render(
    <AuthContext.Provider value={ctxValue}>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

async function tapFirstRow() {
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "daft punk" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(screen.getByText("Get Lucky")).toBeInTheDocument());
  fireEvent.click(screen.getAllByTestId("interactive-row")[0]!);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("UI-11: mini-player present/absent based on playback state", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    cleanup();
    mockAudio();
    mockFetchResponses();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it("mini-player is absent when no track has ever been played (initial state)", () => {
    renderAuthedApp();
    expect(screen.queryByTestId("mini-player")).not.toBeInTheDocument();
  });

  it("mini-player appears after a track starts loading (resolve called)", async () => {
    renderAuthedApp();
    await tapFirstRow();

    await waitFor(() => {
      expect(screen.getByTestId("mini-player")).toBeInTheDocument();
    });
  });

  it("mini-player is hidden on /explore even when a track is playing (UI-16)", async () => {
    renderAuthedApp();
    await tapFirstRow();

    await waitFor(() => expect(screen.getByTestId("mini-player")).toBeInTheDocument());

    // Navigate to /explore via the bottom nav — mini-player must disappear.
    fireEvent.click(screen.getByRole("link", { name: /explore/i }));

    await waitFor(() => {
      expect(screen.queryByTestId("mini-player")).not.toBeInTheDocument();
    });
  });
});

describe("UI-12: resolver returns source:null → failed mini-player, no audio src", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    cleanup();
    mockAudio();
    mockFetchResponses({ resolveResult: RESOLVE_NULL });
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it("when resolve returns source:null the mini-player renders in failed state", async () => {
    renderAuthedApp();
    await tapFirstRow();

    await waitFor(() => {
      const miniPlayer = screen.getByTestId("mini-player");
      expect(miniPlayer).toBeInTheDocument();
      expect(miniPlayer.dataset["playerState"]).toBe("failed");
    });
  });

  it("no streamUrl is set as audio src when source is null (driver.setSrc not called with real URL)", async () => {
    const audioEl = mockAudio();
    mockFetchResponses({ resolveResult: RESOLVE_NULL });
    renderAuthedApp();
    await tapFirstRow();

    await waitFor(() => {
      expect(screen.getByTestId("mini-player")).toBeInTheDocument();
    });
    // audio.src would only be set by the engine's load() — which is not called for source:null.
    expect(audioEl.src).toBe("");
  });
});

describe("UI-13: currently-playing row marked with data-playing attribute", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    cleanup();
    mockAudio();
    mockFetchResponses();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it("the row matching currentTrack gets data-playing='true' after tap", async () => {
    renderAuthedApp();
    await tapFirstRow();

    await waitFor(() => {
      const playingRows = screen
        .getAllByTestId("interactive-row-wrapper")
        .filter((el) => el.dataset["playing"] === "true");
      expect(playingRows).toHaveLength(1);
      expect(playingRows[0]).toHaveTextContent("Get Lucky");
    });
  });

  it("non-matching rows do not have data-playing='true'", async () => {
    renderAuthedApp();
    await tapFirstRow();

    await waitFor(() => {
      const allWrappers = screen.getAllByTestId("interactive-row-wrapper");
      const nonPlayingRows = allWrappers.filter((el) => el.dataset["playing"] !== "true");
      expect(nonPlayingRows.length).toBeGreaterThanOrEqual(1);
      expect(nonPlayingRows.every((el) => !el.dataset["playing"])).toBe(true);
    });
  });
});
