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

/**
 * App-shell connector: reads PlayerContext and renders the DS MiniPlayer.
 * Returns null when no track has ever been played (idle state).
 */
export function MiniPlayerHost(): JSX.Element | null {
  const { engineState, failedTitle, togglePlay, dismissFailed } = usePlayer();
  const { status, currentTrack } = engineState;

  if (status === "idle" || currentTrack === null) {
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
      onExpand={() => {
        // Feature 4 will wire this to the now-playing screen.
      }}
      onDismiss={dismissFailed}
      {...(failedTitle !== null ? { failedTitle } : {})}
    />
  );
}
