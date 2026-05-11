import { useLocation } from "react-router-dom";
import { MiniPlayer } from "@moc/design-system";
import type { MiniPlayerState } from "@moc/design-system";
import { usePlayer } from "./usePlayer.js";

function engineStatusToMiniPlayerState(status: string): MiniPlayerState | null {
  switch (status) {
    case "loading":
      return "loading";
    case "playing":
    case "paused":
    case "ended":
      return "playing";
    case "failed":
      return "failed";
    default:
      return null;
  }
}

export function MiniPlayerHost(): JSX.Element | null {
  const { engineState, failedTitle, togglePlay, dismissFailed, expand } = usePlayer();
  const location = useLocation();
  const { status, currentTrack } = engineState;

  if (status === "idle" || currentTrack === null) {
    return null;
  }

  // UI-16: the explore page owns the player surface (card + progress bar);
  // the docked mini-player must never appear there, even during the brief
  // window between a swipe and the next card's engine-state update.
  if (location.pathname === "/explore") {
    return null;
  }

  const isPlaying = status === "playing";
  const miniState = engineStatusToMiniPlayerState(status);
  if (miniState === null) return null;

  const progressFraction =
    engineState.durationMs > 0 ? engineState.progressMs / engineState.durationMs : 0;

  return (
    <MiniPlayer
      track={currentTrack.snapshot}
      isPlaying={isPlaying}
      progressFraction={progressFraction}
      state={miniState}
      onPlayPause={togglePlay}
      onExpand={expand}
      onDismiss={dismissFailed}
      {...(failedTitle !== null ? { failedTitle } : {})}
    />
  );
}
