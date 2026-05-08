import { MiniPlayer } from "@moc/design-system";
import { usePlayerContext } from "./PlayerProvider.js";

export function MiniPlayerHost(): JSX.Element | null {
  const { engineState, progressFraction, togglePlay, dismissFailed, expandPlayer, isExpanded } =
    usePlayerContext();

  // Hide the mini-player when the full overlay is open
  if (engineState.status === "idle" || isExpanded) return null;

  const track = engineState.ctx;
  const isPlaying = engineState.status === "playing";

  if (engineState.status === "failed") {
    return (
      <MiniPlayer
        track={engineState.ctx.track}
        isPlaying={false}
        progressFraction={0}
        state="failed"
        {...(engineState.errorMsg !== undefined ? { failedTitle: engineState.errorMsg } : {})}
        onPlayPause={togglePlay}
        onExpand={expandPlayer}
        onDismiss={dismissFailed}
      />
    );
  }

  const miniState = engineState.status === "loading" ? "loading" : "playing";

  return (
    <MiniPlayer
      track={track.track}
      isPlaying={isPlaying}
      progressFraction={progressFraction}
      state={miniState}
      onPlayPause={togglePlay}
      onExpand={expandPlayer}
      onDismiss={dismissFailed}
    />
  );
}
