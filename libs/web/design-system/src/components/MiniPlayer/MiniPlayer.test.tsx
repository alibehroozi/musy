// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MiniPlayer } from "./MiniPlayer.js";

const TRACK = {
  title: "Get Lucky",
  artist: "Daft Punk",
  kind: "track" as const,
  coverUrl: undefined,
  year: 2013,
  durationSec: 248,
};

describe("MiniPlayer — playing state", () => {
  it("renders the track title and artist", () => {
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

  it("renders a pause button when isPlaying is true", () => {
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
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("renders a play button when isPlaying is false", () => {
    render(
      <MiniPlayer
        track={TRACK}
        isPlaying={false}
        progressFraction={0.4}
        state="playing"
        onPlayPause={vi.fn()}
        onExpand={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("renders the expand button", () => {
    render(
      <MiniPlayer
        track={TRACK}
        isPlaying
        progressFraction={0.3}
        state="playing"
        onPlayPause={vi.fn()}
        onExpand={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Expand player" })).toBeInTheDocument();
  });

  it("has role=region with accessible name 'Now playing'", () => {
    render(
      <MiniPlayer
        track={TRACK}
        isPlaying
        progressFraction={0.1}
        state="playing"
        onPlayPause={vi.fn()}
        onExpand={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole("region", { name: "Now playing" })).toBeInTheDocument();
  });
});

describe("MiniPlayer — loading state", () => {
  it("renders a loading spinner, not a play/pause button", () => {
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
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
  });
});

describe("MiniPlayer — failed state", () => {
  it("renders the default error message when no failedTitle is given", () => {
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
    expect(screen.getByText(/Couldn't play "Get Lucky"/)).toBeInTheDocument();
  });

  it("renders the custom failedTitle when provided", () => {
    render(
      <MiniPlayer
        track={TRACK}
        isPlaying={false}
        progressFraction={0}
        state="failed"
        failedTitle="Couldn't reach the player service"
        onPlayPause={vi.fn()}
        onExpand={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("Couldn't reach the player service")).toBeInTheDocument();
  });

  it("renders a dismiss button", () => {
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
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("uses role=alert for the failed state", () => {
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
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
