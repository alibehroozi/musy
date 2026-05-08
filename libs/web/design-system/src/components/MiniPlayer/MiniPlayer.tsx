import type { SongSnapshot } from "@moc/contracts";
import { Icon } from "../Icon/Icon.js";
import { IconButton } from "../IconButton/IconButton.js";

export interface MiniPlayerProps {
  track: SongSnapshot;
  isPlaying: boolean;
  progressFraction: number;
  state: "playing" | "loading" | "failed";
  onPlayPause: () => void;
  onExpand: () => void;
  onDismiss: () => void;
  failedTitle?: string;
}

function ArtworkThumb({ coverUrl, title }: { coverUrl?: string; title: string }): JSX.Element {
  if (coverUrl !== undefined) {
    return (
      <img src={coverUrl} alt="" aria-hidden className="size-10 rounded-sm object-cover shrink-0" />
    );
  }
  return (
    <div
      aria-hidden
      className="size-10 rounded-sm bg-border flex items-center justify-center text-sm font-semibold text-text-muted shrink-0"
    >
      {title.charAt(0).toUpperCase()}
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
  if (state === "failed") {
    const message = failedTitle ?? `Couldn't play "${track.title}"`;
    return (
      <div
        role="alert"
        aria-live="polite"
        className="grid items-center gap-3 px-4 py-3 bg-surface border-t border-border"
        style={{ gridTemplateColumns: "36px 1fr 36px" }}
      >
        <span className="inline-flex items-center justify-center text-warning" aria-hidden>
          <Icon name="alert-triangle" size={22} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-text truncate">{message}</p>
          <p className="text-xs text-text-muted mt-0.5">Tap another track to try again.</p>
        </div>
        <IconButton
          icon="x"
          label="Dismiss"
          iconSize={22}
          onClick={onDismiss}
          className="text-text-muted"
        />
      </div>
    );
  }

  const clampedProgress = Math.min(1, Math.max(0, progressFraction));

  return (
    <div
      role="region"
      aria-label="Now playing"
      className="relative grid items-center gap-3 px-3 py-3 bg-surface border-t border-border"
      style={{ gridTemplateColumns: "40px 1fr auto auto" }}
    >
      {/* Thin progress bar at the very top */}
      <div className="absolute left-0 top-0 h-0.5 w-full bg-border" aria-hidden />
      <div
        className="absolute left-0 top-0 h-0.5 bg-primary"
        style={{ width: `${clampedProgress * 100}%` }}
        aria-hidden
      />

      <ArtworkThumb
        {...(track.coverUrl !== undefined ? { coverUrl: track.coverUrl } : {})}
        title={track.title}
      />

      <div className="min-w-0">
        <p className="text-sm font-medium text-text truncate">{track.title}</p>
        <p className="text-xs text-text-muted truncate">{track.artist}</p>
      </div>

      {state === "loading" ? (
        <span
          role="status"
          aria-label="Loading"
          className="inline-flex items-center justify-center size-12"
        >
          <span
            className="size-5 rounded-full border-2 border-border border-t-primary animate-spin"
            aria-hidden
          />
        </span>
      ) : (
        <IconButton
          icon={isPlaying ? "pause" : "play"}
          label={isPlaying ? "Pause" : "Play"}
          iconSize={22}
          onClick={onPlayPause}
        />
      )}

      <IconButton
        icon="chevron-up"
        label="Expand player"
        iconSize={20}
        onClick={onExpand}
        className="text-text-muted"
      />
    </div>
  );
}
