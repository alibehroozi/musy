import type { Story } from "@ladle/react";
import { MiniPlayer } from "./MiniPlayer.js";
import type { TrackSnapshot } from "./MiniPlayer.js";

export default {
  title: "MiniPlayer",
};

const TRACK: TrackSnapshot = {
  title: "Get Lucky",
  artist: "Daft Punk",
  kind: "track",
  durationSec: 369,
};

const TRACK_WITH_ART: TrackSnapshot = {
  title: "Blinding Lights",
  artist: "The Weeknd",
  kind: "track",
  coverUrl: "https://placehold.co/56x56/222/888?text=B",
  durationSec: 200,
};

export const Playing: Story = () => (
  <div className="bg-bg" style={{ width: 390 }}>
    <MiniPlayer
      track={TRACK_WITH_ART}
      isPlaying
      progressFraction={0.38}
      state="playing"
      onPlayPause={() => {}}
      onExpand={() => {}}
      onDismiss={() => {}}
    />
  </div>
);

export const Paused: Story = () => (
  <div className="bg-bg" style={{ width: 390 }}>
    <MiniPlayer
      track={TRACK}
      isPlaying={false}
      progressFraction={0.6}
      state="playing"
      onPlayPause={() => {}}
      onExpand={() => {}}
      onDismiss={() => {}}
    />
  </div>
);

export const Loading: Story = () => (
  <div className="bg-bg" style={{ width: 390 }}>
    <MiniPlayer
      track={TRACK}
      isPlaying={false}
      progressFraction={0}
      state="loading"
      onPlayPause={() => {}}
      onExpand={() => {}}
      onDismiss={() => {}}
    />
  </div>
);

export const Failed: Story = () => (
  <div className="bg-bg" style={{ width: 390 }}>
    <MiniPlayer
      track={TRACK}
      isPlaying={false}
      progressFraction={0}
      state="failed"
      onPlayPause={() => {}}
      onExpand={() => {}}
      onDismiss={() => {}}
    />
  </div>
);

export const FailedServiceError: Story = () => (
  <div className="bg-bg" style={{ width: 390 }}>
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
  </div>
);
