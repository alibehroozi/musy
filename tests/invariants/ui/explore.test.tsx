// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-16, UI-17, UI-18, UI-19.

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

const ITEMS = [
  { title: "Get Lucky", artist: "Daft Punk", durationSec: 369, kind: "track" as const },
  { title: "One More Time", artist: "Daft Punk", durationSec: 320, kind: "track" as const },
  { title: "Strobe", artist: "Deadmau5", durationSec: 600, kind: "track" as const },
  { title: "Sandstorm", artist: "Darude", durationSec: 230, kind: "track" as const },
];

function exploreNextResponse(overrides: Partial<NextResponse> = {}): NextResponse {
  return {
    items: ITEMS,
    phase: "discovery",
    partial: false,
    ...overrides,
  };
}

function mockFetchHandlers({
  next = exploreNextResponse(),
  profile = null as unknown,
  resolve = {
    source: "audius",
    sourceTrackId: "audius-1",
    streamUrl: "https://stream.audius.co/foo",
    expiresAt: "2026-12-31T00:00:00.000Z",
  },
}: {
  next?: NextResponse;
  profile?: unknown;
  resolve?: unknown;
} = {}) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/explore/next")) {
      return new Response(JSON.stringify(next), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/explore/profile")) {
      return new Response(JSON.stringify(profile), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/explore/swipe")) {
      return new Response(null, { status: 204 });
    }
    if (url.includes("/api/play/resolve")) {
      return new Response(JSON.stringify(resolve), {
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
  }) as typeof globalThis.fetch;
}

function renderAuthedApp(initialPath = "/explore") {
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

describe("UI-16: mini-player hidden when /explore card is the player surface", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    cleanup();
    localStorage.setItem("moc.explore.onboarded", "1");
    mockAudio();
    mockFetchHandlers();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    globalThis.fetch = originalFetch;
  });

  it("on /explore, with currentTrack matching the top card, the docked mini-player is not rendered", async () => {
    renderAuthedApp("/explore");
    // Wait for the queue to load, then for the resolve to fire and the
    // mini-player gating to take effect.
    await waitFor(() => expect(screen.getByText("Get Lucky")).toBeInTheDocument());
    await waitFor(() => {
      // Mini-player would have data-testid='mini-player' from the DS.
      expect(screen.queryByTestId("mini-player")).not.toBeInTheDocument();
    });
  });

  it("on any other route, the mini-player is rendered when a track is loaded", async () => {
    // Start on /explore so the player loads a top card, then navigate away.
    renderAuthedApp("/explore");
    await waitFor(() => expect(screen.getByText("Get Lucky")).toBeInTheDocument());

    // Navigate to /search via the bottom nav.
    fireEvent.click(screen.getByRole("link", { name: /search/i }));

    await waitFor(() => {
      expect(screen.getByTestId("mini-player")).toBeInTheDocument();
    });
  });
});

describe("UI-17: onboarding overlay on first visit + localStorage flag", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    mockAudio();
    mockFetchHandlers();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    globalThis.fetch = originalFetch;
  });

  it("renders an overlay with role=dialog and aria-modal=true when localStorage is unset", async () => {
    renderAuthedApp("/explore");
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("tapping 'Got it' sets localStorage flag and removes the overlay", async () => {
    renderAuthedApp("/explore");
    const button = await screen.findByRole("button", { name: "Got it" });
    fireEvent.click(button);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(localStorage.getItem("moc.explore.onboarded")).toBe("1");
  });

  it("with localStorage flag set, the overlay does not render", async () => {
    localStorage.setItem("moc.explore.onboarded", "1");
    renderAuthedApp("/explore");
    await waitFor(() => expect(screen.getByText("Get Lucky")).toBeInTheDocument());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("UI-18: phase pill copy keyed off profile.phase", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    cleanup();
    localStorage.setItem("moc.explore.onboarded", "1");
    mockAudio();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    globalThis.fetch = originalFetch;
  });

  it("phase='discovery' → pill text is 'Discovering taste'", async () => {
    mockFetchHandlers({ next: exploreNextResponse({ phase: "discovery" }) });
    renderAuthedApp("/explore");
    await waitFor(() => {
      expect(screen.getByTestId("phase-pill")).toHaveTextContent("Discovering taste");
    });
  });

  it("phase='artist-refinement' → pill text is 'Finding artists'", async () => {
    mockFetchHandlers({ next: exploreNextResponse({ phase: "artist-refinement" }) });
    renderAuthedApp("/explore");
    await waitFor(() => {
      expect(screen.getByTestId("phase-pill")).toHaveTextContent("Finding artists");
    });
  });

  it("phase='personalized' → pill is absent from the DOM", async () => {
    mockFetchHandlers({ next: exploreNextResponse({ phase: "personalized" }) });
    renderAuthedApp("/explore");
    await waitFor(() => expect(screen.getByText("Get Lucky")).toBeInTheDocument());
    expect(screen.queryByTestId("phase-pill")).not.toBeInTheDocument();
  });
});

describe("UI-19: exactly one card carries data-explore-position='top'", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    cleanup();
    localStorage.setItem("moc.explore.onboarded", "1");
    mockAudio();
    mockFetchHandlers();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    globalThis.fetch = originalFetch;
  });

  function topCount(container: HTMLElement): number {
    return container.querySelectorAll("[data-explore-position='top']").length;
  }

  it("on initial render, exactly one card carries data-explore-position='top'", async () => {
    const { container } = renderAuthedApp("/explore");
    await waitFor(() => expect(screen.getByText("Get Lucky")).toBeInTheDocument());
    expect(topCount(container as HTMLElement)).toBe(1);
  });

  it("after a like activation, the top card moves to the next item", async () => {
    const { container } = renderAuthedApp("/explore");
    await waitFor(() => expect(screen.getByText("Get Lucky")).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Like" }));
    });

    await waitFor(() => {
      expect(screen.getByText("One More Time")).toBeInTheDocument();
    });
    expect(topCount(container as HTMLElement)).toBe(1);
    // The previous top card (Get Lucky) is no longer in the visible top-3 stack.
    const top = container.querySelector("[data-explore-position='top']");
    expect(top?.textContent).toContain("One More Time");
  });
});
