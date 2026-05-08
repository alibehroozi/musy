// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-09, UI-10, and UI-11.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import {
  PlayerContext,
  type PlayerContextValue,
} from "../../../apps/web/src/features/player/PlayerProvider.js";
import { MiniPlayerHost } from "../../../apps/web/src/features/player/MiniPlayerHost.js";
import { ResultRow } from "@moc/design-system";

const TRACK = {
  title: "Get Lucky",
  artist: "Daft Punk",
  kind: "track" as const,
};

const TRACK_CTX = { track: TRACK, source: "audius", sourceTrackId: "abc" };

function idleCtx(): PlayerContextValue {
  return {
    engineState: { status: "idle" },
    progressFraction: 0,
    playSnapshot: vi.fn(),
    togglePlay: vi.fn(),
    dismissFailed: vi.fn(),
  };
}

function playingCtx(): PlayerContextValue {
  return {
    engineState: { status: "playing", ctx: TRACK_CTX },
    progressFraction: 0.4,
    playSnapshot: vi.fn(),
    togglePlay: vi.fn(),
    dismissFailed: vi.fn(),
  };
}

function pausedCtx(): PlayerContextValue {
  return {
    engineState: { status: "paused", ctx: TRACK_CTX },
    progressFraction: 0.4,
    playSnapshot: vi.fn(),
    togglePlay: vi.fn(),
    dismissFailed: vi.fn(),
  };
}

function mockMeAnon(): void {
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ error: { code: "unauthorized", message: "no session" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
  ) as typeof globalThis.fetch;
}

const originalFetch = globalThis.fetch;
beforeEach(() => {
  cleanup();
  mockMeAnon();
});
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

describe("UI-09: mini-player is visible above bottom nav when a track is playing or paused", () => {
  it("mini-player region is rendered when engine status is playing", () => {
    render(
      <PlayerContext.Provider value={playingCtx()}>
        <MiniPlayerHost />
      </PlayerContext.Provider>,
    );
    expect(screen.getByRole("region", { name: "Now playing" })).toBeInTheDocument();
  });

  it("mini-player region is rendered when engine status is paused", () => {
    render(
      <PlayerContext.Provider value={pausedCtx()}>
        <MiniPlayerHost />
      </PlayerContext.Provider>,
    );
    expect(screen.getByRole("region", { name: "Now playing" })).toBeInTheDocument();
  });

  it("mini-player is present inside a routed context when a track is playing", async () => {
    render(
      <MemoryRouter initialEntries={["/explore"]}>
        <PlayerContext.Provider value={playingCtx()}>
          <MiniPlayerHost />
        </PlayerContext.Provider>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Now playing" })).toBeInTheDocument(),
    );
  });
});

describe("UI-10: no mini-player is rendered when no track has ever been played", () => {
  it("mini-player region is absent from the DOM when engine status is idle", () => {
    render(
      <PlayerContext.Provider value={idleCtx()}>
        <MiniPlayerHost />
      </PlayerContext.Provider>,
    );
    expect(screen.queryByRole("region", { name: "Now playing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("mini-player region is absent from the DOM in a routed context when engine status is idle", async () => {
    render(
      <MemoryRouter initialEntries={["/search"]}>
        <PlayerContext.Provider value={idleCtx()}>
          <MiniPlayerHost />
        </PlayerContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("region", { name: "Now playing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("UI-11: currently-playing row has playing overlay; other rows do not", () => {
  it("result row for the currently-playing track has data-playing='true' on its artwork wrapper", () => {
    render(
      <ResultRow
        variant="track"
        title="Get Lucky"
        artist="Daft Punk"
        sourceBadge="Audius"
        playingOverlay
      />,
    );
    const playing = document.querySelector("[data-playing='true']");
    expect(playing).toBeInTheDocument();
  });

  it("result rows for non-playing tracks do not have data-playing='true'", () => {
    render(<ResultRow variant="track" title="Get Lucky" artist="Daft Punk" sourceBadge="Audius" />);
    const playing = document.querySelector("[data-playing='true']");
    expect(playing).not.toBeInTheDocument();
  });
});
