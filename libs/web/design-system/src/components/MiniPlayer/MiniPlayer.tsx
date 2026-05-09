import { Icon } from "../Icon/Icon.js";
import { IconButton } from "../IconButton/IconButton.js";
import { Typography } from "../Typography/Typography.js";

/** Structural equivalent of contracts TrackSnapshot — kept local to avoid DS→contracts dep. */
export interface TrackSnapshot {
  title: string;
  artist: string;
  kind: "track" | "station";
  coverUrl?: string;
  durationSec?: number;
}

export type MiniPlayerState = "playing" | "loading" | "failed";

export interface MiniPlayerProps {
  track: TrackSnapshot;
  isPlaying: boolean;
  progressFraction: number;
  state: MiniPlayerState;
  onPlayPause: () => void;
  onExpand: () => void;
  onDismiss: () => void;
  /** Custom copy for the failed state. Default: "Couldn't play '<title>'" */
  failedTitle?: string;
}

function ArtworkThumb({ track }: { track: TrackSnapshot }): JSX.Element {
  if (track.coverUrl !== undefined) {
    return (
      <img
        src={track.coverUrl}
        alt=""
        aria-hidden
        className="size-10 rounded object-cover shrink-0"
      />
    );
  }
  return (
    <div
      aria-hidden
      className="size-10 rounded bg-border flex items-center justify-center text-sm font-semibold text-text-muted shrink-0"
    >
      {track.title.charAt(0).toUpperCase()}
    </div>
  );
}

export function MiniPlayer({
  track,
  isPlaying,
  progressFraction,
  state,
  onPlayPause,
  onExpand,
  onDismiss,
  failedTitle,
}: MiniPlayerProps): JSX.Element {
  const clampedProgress = Math.min(1, Math.max(0, progressFraction));

  if (state === "failed") {
    const copy = failedTitle ?? `Couldn't play '${track.title}'`;
    return (
      <div
        className="bg-surface border-t border-border px-4 py-2 flex items-center gap-3"
        data-testid="mini-player"
        data-player-state="failed"
        role="status"
        aria-label="Playback failed"
      >
        <Icon name="alert-triangle" size={20} className="text-warning shrink-0" />
        <Typography variant="caption" className="flex-1 truncate text-text-muted">
          {copy}
        </Typography>
        <IconButton aria-label="Dismiss player" onClick={onDismiss}>
          <Icon name="x" size={18} />
        </IconButton>
      </div>
    );
  }

  return (
    <div
      className="bg-surface border-t border-border"
      data-testid="mini-player"
      data-player-state={state}
    >
      <div className="flex items-center gap-3 px-4 py-2">
        <button
          type="button"
          onClick={onExpand}
          aria-label={`Now playing: ${track.title} by ${track.artist}`}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <ArtworkThumb track={track} />
          <div className="flex-1 min-w-0">
            <Typography
              variant="caption"
              className="text-text font-semibold truncate block leading-tight"
            >
              {track.title}
            </Typography>
            <Typography variant="caption" className="text-text-muted truncate block leading-tight">
              {track.artist}
            </Typography>
          </div>
        </button>

        {state === "loading" ? (
          <div
            className="size-11 flex items-center justify-center shrink-0"
            role="status"
            aria-label="Loading"
          >
            <svg
              className="animate-spin text-primary"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              width={20}
              height={20}
              aria-hidden
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          </div>
        ) : (
          <IconButton
            aria-label={isPlaying ? "Pause" : "Play"}
            onClick={onPlayPause}
            variant="filled"
          >
            <Icon name={isPlaying ? "pause" : "play"} size={18} />
          </IconButton>
        )}

        <IconButton aria-label="Expand player" onClick={onExpand}>
          <Icon name="chevron-up" size={18} />
        </IconButton>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-border" aria-hidden>
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${clampedProgress * 100}%` }}
        />
      </div>
    </div>
  );
}
