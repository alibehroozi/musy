import { useLocation } from "react-router-dom";
import { MiniPlayer } from "@moc/design-system";
import type { MiniPlayerState } from "@moc/design-system";
import { snapshotsMatch } from "@moc/web-core";
import { usePlayer } from "./usePlayer.js";
import { useExploreTopCard } from "../explore/ExploreTopCardContext.js";

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
  const { topCard } = useExploreTopCard();
  const location = useLocation();
  const { status, currentTrack } = engineState;

  if (status === "idle" || currentTrack === null) {
    return null;
  }

  // UI-16: when the route is /explore AND the swipe-deck top card matches
  // the currently-loaded track, the card itself owns the player surface
  // and the docked mini-player is hidden.
  if (location.pathname === "/explore" && snapshotsMatch(currentTrack.snapshot, topCard)) {
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
