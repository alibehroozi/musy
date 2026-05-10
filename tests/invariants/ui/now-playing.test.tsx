// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-14, UI-15.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../../apps/web/src/App.js";
import { AuthContext, type AuthContextValue } from "../../../apps/web/src/contexts/AuthContext.js";
import type { User } from "@moc/contracts";

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
  ],
  partial: false,
  failedProviders: [],
  cached: false,
};

const STATION_RESPONSE = {
  results: [
    {
      type: "station",
      id: "radio-browser:station:1",
      name: "BBC Radio 1",
      provider: "radio-browser",
      providerId: "rb-1",
      sources: ["radio-browser"],
      country: "United Kingdom",
      streamUrl: "https://stream.example/bbc.m3u8",
    },
  ],
  partial: false,
  failedProviders: [],
  cached: false,
};

const RESOLVE_OK = {
  source: "audius",
  sourceTrackId: "audius-1",
  streamUrl: "https://stream.example/track.mp3",
  expiresAt: "2026-12-31T00:00:00.000Z",
};

// ResolveSource is restricted to ["audius", "soundcloud"] in contracts; the
// resolver's source field is independent of the search-row provider, so a
// valid enum value here is enough to drive the UI test (which keys off
// snapshot.kind, not currentSource.source).
const RESOLVE_STATION = {
  source: "audius",
  sourceTrackId: "rb-1",
  streamUrl: "https://stream.example/bbc.mp3",
  expiresAt: "2026-12-31T00:00:00.000Z",
};

function mockFetchResponses({
  searchResults = TRACK_RESPONSE,
  resolveResult = RESOLVE_OK,
}: { searchResults?: object; resolveResult?: object } = {}) {
  globalThis.fetch = vi.fn(async (url: unknown) => {
    const u = url as string;
    if (u.includes("/search/history")) {
      return new Response(JSON.stringify({ entries: [], nextCursor: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (u.includes("/play/resolve")) {
      return new Response(JSON.stringify(resolveResult), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (
      u.includes("/play/started") ||
      u.includes("/play/completed") ||
      u.includes("/search/explored") ||
      u.includes("/search/saved")
    ) {
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

async function tapFirstRowAndExpand(query = "daft punk", row = "Get Lucky"): Promise<void> {
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: query } });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(screen.getByText(row)).toBeInTheDocument());
  fireEvent.click(screen.getAllByTestId("interactive-row")[0]!);
  await waitFor(() => expect(screen.getByTestId("mini-player")).toBeInTheDocument());
  // The mini-player carries the first expand button (label "Expand player"),
  // matching the design — tap it to open the overlay.
  fireEvent.click(screen.getByRole("button", { name: /now playing/i }));
}

// ─── UI-14 ───────────────────────────────────────────────────────────────────

describe("UI-14: NowPlayingOverlay rendering follows isExpanded + currentTrack", () => {
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

  it("when isExpanded is false (no expand tapped), the overlay is not in the DOM", async () => {
    renderAuthedApp();
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "daft punk" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("Get Lucky")).toBeInTheDocument());
    fireEvent.click(screen.getAllByTestId("interactive-row")[0]!);
    await waitFor(() => expect(screen.getByTestId("mini-player")).toBeInTheDocument());

    expect(screen.queryByTestId("now-playing-overlay")).not.toBeInTheDocument();
  });

  it("when no track is loaded, the overlay is not in the DOM even after expand attempt", () => {
    renderAuthedApp();
    expect(screen.queryByTestId("now-playing-overlay")).not.toBeInTheDocument();
  });

  it("when isExpanded is true and a track is loaded, the overlay is in the DOM with role='dialog' and aria-modal='true'", async () => {
    renderAuthedApp();
    await tapFirstRowAndExpand();

    const overlay = await screen.findByTestId("now-playing-overlay");
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveAttribute("role", "dialog");
    expect(overlay).toHaveAttribute("aria-modal", "true");
  });

  it("collapsing via the chevron-down removes the overlay from the DOM", async () => {
    renderAuthedApp();
    await tapFirstRowAndExpand();
    await screen.findByTestId("now-playing-overlay");

    fireEvent.click(screen.getByRole("button", { name: "Collapse player" }));
    await waitFor(() =>
      expect(screen.queryByTestId("now-playing-overlay")).not.toBeInTheDocument(),
    );
  });
});

// ─── UI-15 ───────────────────────────────────────────────────────────────────

describe("UI-15: track variant vs station variant", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    cleanup();
    mockAudio();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it("for a track snapshot, renders the progress slider (slider role) and an enabled skip-back button", async () => {
    mockFetchResponses();
    renderAuthedApp();
    await tapFirstRowAndExpand();

    const overlay = await screen.findByTestId("now-playing-overlay");
    expect(overlay.querySelector("[role='slider']")).not.toBeNull();
    expect(screen.queryByTestId("now-playing-live")).not.toBeInTheDocument();

    const skipBack = screen.getByRole("button", { name: "Skip back" });
    expect(skipBack).not.toBeDisabled();
    expect(skipBack).toHaveAttribute("aria-disabled", "false");
  });

  it("for a station snapshot, renders the LIVE indicator (no slider) and both skip buttons carry aria-disabled='true'", async () => {
    mockFetchResponses({ searchResults: STATION_RESPONSE, resolveResult: RESOLVE_STATION });
    renderAuthedApp();
    await tapFirstRowAndExpand("bbc", "BBC Radio 1");

    const overlay = await screen.findByTestId("now-playing-overlay");
    expect(screen.getByTestId("now-playing-live")).toBeInTheDocument();
    expect(overlay.querySelector("[role='slider']")).toBeNull();

    const skipBack = screen.getByRole("button", { name: "Skip back" });
    const skipForward = screen.getByRole("button", { name: "Skip forward" });
    expect(skipBack).toHaveAttribute("aria-disabled", "true");
    expect(skipForward).toHaveAttribute("aria-disabled", "true");
  });
});
