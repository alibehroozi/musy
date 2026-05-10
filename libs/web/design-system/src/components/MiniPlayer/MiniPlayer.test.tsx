// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MiniPlayer } from "./MiniPlayer.js";
import type { TrackSnapshot } from "./MiniPlayer.js";

const TRACK: TrackSnapshot = {
  title: "Get Lucky",
  artist: "Daft Punk",
  kind: "track",
  durationSec: 369,
};

describe("MiniPlayer — playing state", () => {
  it("renders track title and artist", () => {
    render(
      <MiniPlayer
        track={TRACK}
        isPlaying
        progressFraction={0.4}
        state="playing"
        onPlayPause={vi.fn()}
        onExpand={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("Get Lucky")).toBeInTheDocument();
    expect(screen.getByText("Daft Punk")).toBeInTheDocument();
  });

  it("renders pause button when isPlaying", () => {
    render(
      <MiniPlayer
        track={TRACK}
        isPlaying
        progressFraction={0}
        state="playing"
        onPlayPause={vi.fn()}
        onExpand={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("renders play button when not playing", () => {
    render(
      <MiniPlayer
        track={TRACK}
        isPlaying={false}
        progressFraction={0}
        state="playing"
        onPlayPause={vi.fn()}
        onExpand={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("calls onPlayPause when play/pause button is clicked", () => {
    const onPlayPause = vi.fn();
    render(
      <MiniPlayer
        track={TRACK}
        isPlaying={false}
        progressFraction={0}
        state="playing"
        onPlayPause={onPlayPause}
        onExpand={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(onPlayPause).toHaveBeenCalledOnce();
  });
});

describe("MiniPlayer — loading state", () => {
  it("renders a loading spinner (no play/pause button)", () => {
    render(
      <MiniPlayer
        track={TRACK}
        isPlaying={false}
        progressFraction={0}
        state="loading"
        onPlayPause={vi.fn()}
        onExpand={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });
});

describe("MiniPlayer — failed state", () => {
  it("renders warning message with default copy", () => {
    render(
      <MiniPlayer
        track={TRACK}
        isPlaying={false}
        progressFraction={0}
        state="failed"
        onPlayPause={vi.fn()}
        onExpand={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText(/Couldn't play/)).toBeInTheDocument();
  });

  it("renders custom failedTitle when provided", () => {
    render(
      <MiniPlayer
        track={TRACK}
        isPlaying={false}
        progressFraction={0}
        state="failed"
        onPlayPause={vi.fn()}
        onExpand={vi.fn()}
        onDismiss={vi.fn()}
        failedTitle="Couldn't reach the player service"
      />,
    );
    expect(screen.getByText("Couldn't reach the player service")).toBeInTheDocument();
  });

  it("calls onDismiss when dismiss button is clicked", () => {
    const onDismiss = vi.fn();
    render(
      <MiniPlayer
        track={TRACK}
        isPlaying={false}
        progressFraction={0}
        state="failed"
        onPlayPause={vi.fn()}
        onExpand={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss player" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
