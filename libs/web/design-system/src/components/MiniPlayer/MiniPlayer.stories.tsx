import type { Story } from "@ladle/react";
import { MiniPlayer } from "./MiniPlayer.js";

const TRACK = {
  title: "Get Lucky",
  artist: "Daft Punk",
  kind: "track" as const,
  year: 2013,
};

export const Playing: Story = () => (
  <MiniPlayer
    track={TRACK}
    isPlaying
    progressFraction={0.38}
    state="playing"
    onPlayPause={() => {}}
    onExpand={() => {}}
    onDismiss={() => {}}
  />
);

export const Paused: Story = () => (
  <MiniPlayer
    track={TRACK}
    isPlaying={false}
    progressFraction={0.38}
    state="playing"
    onPlayPause={() => {}}
    onExpand={() => {}}
    onDismiss={() => {}}
  />
);

export const Loading: Story = () => (
  <MiniPlayer
    track={TRACK}
    isPlaying={false}
    progressFraction={0}
    state="loading"
    onPlayPause={() => {}}
    onExpand={() => {}}
    onDismiss={() => {}}
  />
);

export const Failed: Story = () => (
  <MiniPlayer
    track={TRACK}
    isPlaying={false}
    progressFraction={0}
    state="failed"
    onPlayPause={() => {}}
    onExpand={() => {}}
    onDismiss={() => {}}
  />
);

export const FailedServiceError: Story = () => (
  <MiniPlayer
    track={TRACK}
    isPlaying={false}
    progressFraction={0}
    state="failed"
    failedTitle="Couldn't reach the player service"
    onPlayPause={() => {}}
    onExpand={() => {}}
    onDismiss={() => {}}
  />
);
