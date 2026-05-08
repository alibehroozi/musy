// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-12 and UI-13.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import {
  PlayerContext,
  type PlayerContextValue,
} from "../../../apps/web/src/features/player/PlayerProvider.js";
import { NowPlayingOverlay } from "../../../apps/web/src/features/player/NowPlayingOverlay.js";

const TRACK = {
  title: "Get Lucky",
  artist: "Daft Punk",
  kind: "track" as const,
  durationSec: 248,
  coverUrl: "https://example.com/cover.jpg",
};

const STATION = {
  title: "Jazz FM",
  artist: "Various Artists",
  kind: "station" as const,
};

const TRACK_CTX = { track: TRACK, source: "audius", sourceTrackId: "abc" };
const STATION_CTX = { track: STATION, source: "radio-browser", sourceTrackId: "radio-1" };

function makeCtx(overrides: Partial<PlayerContextValue> = {}): PlayerContextValue {
  return {
    engineState: { status: "playing", ctx: TRACK_CTX },
    progressFraction: 0.3,
    isExpanded: true,
    playSnapshot: vi.fn(),
    togglePlay: vi.fn(),
    dismissFailed: vi.fn(),
    expandPlayer: vi.fn(),
    collapsePlayer: vi.fn(),
    seekToFraction: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => cleanup());
afterEach(() => cleanup());

describe("UI-12: now-playing overlay renders with role=dialog when expanded; absent when collapsed", () => {
  it("when isExpanded is true, the overlay is in the DOM with role=dialog", () => {
    render(
      <MemoryRouter>
        <PlayerContext.Provider value={makeCtx({ isExpanded: true })}>
          <NowPlayingOverlay />
        </PlayerContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("when isExpanded is false (collapsed), no role=dialog element is in the DOM", () => {
    render(
      <MemoryRouter>
        <PlayerContext.Provider value={makeCtx({ isExpanded: false })}>
          <NowPlayingOverlay />
        </PlayerContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("the overlay contains a visible collapse/close button", () => {
    render(
      <MemoryRouter>
        <PlayerContext.Provider value={makeCtx({ isExpanded: true })}>
          <NowPlayingOverlay />
        </PlayerContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: /collapse player/i })).toBeInTheDocument();
  });
});

describe("UI-13: station variant shows LIVE indicator and disabled skips; track variant shows progress bar", () => {
  it("for a track, the progress bar (slider) is rendered and skip-back button is not aria-disabled", () => {
    render(
      <MemoryRouter>
        <PlayerContext.Provider
          value={makeCtx({ engineState: { status: "playing", ctx: TRACK_CTX } })}
        >
          <NowPlayingOverlay />
        </PlayerContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.getByRole("slider", { name: /playback progress/i })).toBeInTheDocument();
    const skipBack = screen.getByRole("button", { name: /skip to beginning/i });
    expect(skipBack).not.toHaveAttribute("aria-disabled", "true");
    expect(skipBack).not.toBeDisabled();
  });

  it("for a station, no progress bar (slider) is rendered", () => {
    render(
      <MemoryRouter>
        <PlayerContext.Provider
          value={makeCtx({ engineState: { status: "playing", ctx: STATION_CTX } })}
        >
          <NowPlayingOverlay />
        </PlayerContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("for a station, skip-back and skip-forward buttons are disabled", () => {
    render(
      <MemoryRouter>
        <PlayerContext.Provider
          value={makeCtx({ engineState: { status: "playing", ctx: STATION_CTX } })}
        >
          <NowPlayingOverlay />
        </PlayerContext.Provider>
      </MemoryRouter>,
    );
    const skipBack = screen.getByRole("button", { name: /skip to beginning/i });
    expect(skipBack).toBeDisabled();
    const skipFwd = screen.getByRole("button", { name: /skip forward/i });
    expect(skipFwd).toBeDisabled();
  });

  it("for a station, a LIVE indicator element is visible", () => {
    render(
      <MemoryRouter>
        <PlayerContext.Provider
          value={makeCtx({ engineState: { status: "playing", ctx: STATION_CTX } })}
        >
          <NowPlayingOverlay />
        </PlayerContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.getByText("LIVE")).toBeInTheDocument();
  });
});
