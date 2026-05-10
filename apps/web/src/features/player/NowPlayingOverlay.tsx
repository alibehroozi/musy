import { useState } from "react";
import { Icon, IconButton, ProgressSlider, Typography } from "@moc/design-system";
import { formatProgress } from "@moc/web-core";
import { recordSaved } from "@moc/web-core";
import type { SavedEventRequest, SongSnapshot, ProviderName } from "@moc/contracts";
import { usePlayer } from "./usePlayer.js";
import { useAuth } from "../../hooks/useAuth.js";

function ProviderBadge({ source }: { source: ProviderName }): JSX.Element {
  const label = source === "radio-browser" ? "Radio Browser" : source;
  return (
    <span className="inline-block rounded-full bg-surface text-text-muted text-xs px-3 py-1 capitalize">
      {label}
    </span>
  );
}

function CoverArt({ snapshot }: { snapshot: SongSnapshot }): JSX.Element {
  if (snapshot.coverUrl !== undefined) {
    return (
      <img
        src={snapshot.coverUrl}
        alt=""
        aria-hidden
        style={{ width: "min(280px, 75vw)", height: "min(280px, 75vw)" }}
        className="rounded-lg object-cover shadow-lg"
      />
    );
  }
  const letter = snapshot.title.charAt(0).toUpperCase() || "?";
  return (
    <div
      aria-hidden
      data-testid="cover-fallback"
      className="rounded-lg shadow-lg flex items-center justify-center bg-surface text-text font-bold"
      style={{
        width: "min(280px, 75vw)",
        height: "min(280px, 75vw)",
        fontSize: "min(96px, 25vw)",
      }}
    >
      {letter}
    </div>
  );
}

function LiveIndicator(): JSX.Element {
  return (
    <div
      className="flex items-center gap-2 text-danger text-sm font-semibold tracking-wider"
      data-testid="now-playing-live"
    >
      <span aria-hidden className="size-2 rounded-full bg-danger motion-safe:animate-pulse" />
      <span>LIVE</span>
    </div>
  );
}

function SaveHeart({
  snapshot,
  source,
  externalId,
}: {
  snapshot: SongSnapshot;
  source: ProviderName;
  externalId: string;
}): JSX.Element {
  const { state } = useAuth();
  const [saved, setSaved] = useState(false);

  const handleClick = (): void => {
    if (state.status !== "authenticated") return;
    setSaved(true);
    const body: SavedEventRequest = { source, externalId, snapshot };
    void recordSaved(body).catch(() => {
      // Silent — analytics-style call. Optimistic state is preserved.
    });
  };

  return (
    <IconButton
      aria-label={saved ? "Saved" : "Save"}
      aria-pressed={saved}
      variant={saved ? "filled" : "default"}
      onClick={handleClick}
    >
      <Icon name={saved ? "heart-filled" : "heart"} size={20} />
    </IconButton>
  );
}

interface OverlayBodyProps {
  snapshot: SongSnapshot;
  source: ProviderName;
  externalId: string;
  isPlaying: boolean;
  progressMs: number;
  durationMs: number;
  onTogglePlay: () => void;
  onSkipBack: () => void;
  onSeek: (positionMs: number) => void;
}

function TrackVariant(props: OverlayBodyProps): JSX.Element {
  const {
    snapshot,
    source,
    externalId,
    isPlaying,
    progressMs,
    durationMs,
    onTogglePlay,
    onSkipBack,
    onSeek,
  } = props;
  const [drag, setDrag] = useState<{ fraction: number } | null>(null);
  const display = drag !== null ? drag.fraction * durationMs : progressMs;
  const { fraction, currentLabel, remainingLabel } = formatProgress(display, durationMs);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-center">
        <CoverArt snapshot={snapshot} />
      </div>

      <div className="flex items-start justify-between gap-3 mt-2">
        <div className="flex-1 min-w-0">
          <Typography variant="h2" className="text-text font-bold truncate leading-tight">
            {snapshot.title}
          </Typography>
          <Typography variant="body" className="text-text-muted truncate mt-0.5">
            {snapshot.artist}
          </Typography>
        </div>
        <SaveHeart snapshot={snapshot} source={source} externalId={externalId} />
      </div>

      <div className="flex flex-col gap-2">
        <ProgressSlider
          valueFraction={fraction}
          ariaLabel="Playback position"
          onScrub={(f) => setDrag({ fraction: f })}
          onScrubEnd={(f) => {
            setDrag(null);
            onSeek(f * durationMs);
          }}
        />
        <div className="flex justify-between text-text-muted text-xs">
          <span data-testid="np-current">{currentLabel}</span>
          <span data-testid="np-remaining">{remainingLabel}</span>
        </div>
      </div>

      <Transport
        isPlaying={isPlaying}
        onTogglePlay={onTogglePlay}
        onSkipBack={onSkipBack}
        skipBackDisabled={false}
        skipForwardDisabled
      />
    </div>
  );
}

function StationVariant(
  props: Omit<OverlayBodyProps, "progressMs" | "durationMs" | "onSeek">,
): JSX.Element {
  const { snapshot, source, externalId, isPlaying, onTogglePlay } = props;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-center">
        <CoverArt snapshot={snapshot} />
      </div>

      <div className="flex items-start justify-between gap-3 mt-2">
        <div className="flex-1 min-w-0">
          <Typography variant="h2" className="text-text font-bold truncate leading-tight">
            {snapshot.title}
          </Typography>
          {snapshot.artist !== "" ? (
            <Typography variant="body" className="text-text-muted truncate mt-0.5">
              {snapshot.artist}
            </Typography>
          ) : null}
        </div>
        <SaveHeart snapshot={snapshot} source={source} externalId={externalId} />
      </div>

      <LiveIndicator />

      <Transport
        isPlaying={isPlaying}
        onTogglePlay={onTogglePlay}
        onSkipBack={() => {}}
        skipBackDisabled
        skipForwardDisabled
      />
    </div>
  );
}

function Transport({
  isPlaying,
  onTogglePlay,
  onSkipBack,
  skipBackDisabled,
  skipForwardDisabled,
}: {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSkipBack: () => void;
  skipBackDisabled: boolean;
  skipForwardDisabled: boolean;
}): JSX.Element {
  return (
    <div className="flex items-center justify-center gap-8">
      <IconButton
        aria-label="Skip back"
        aria-disabled={skipBackDisabled}
        disabled={skipBackDisabled}
        onClick={skipBackDisabled ? undefined : onSkipBack}
        size="md"
      >
        <Icon name="skip-back" size={28} />
      </IconButton>
      <IconButton
        aria-label={isPlaying ? "Pause" : "Play"}
        variant="filled"
        size="md"
        onClick={onTogglePlay}
      >
        <Icon name={isPlaying ? "pause" : "play"} size={28} />
      </IconButton>
      <IconButton
        aria-label="Skip forward"
        aria-disabled={skipForwardDisabled}
        disabled={skipForwardDisabled}
        size="md"
      >
        <Icon name="skip-forward" size={28} />
      </IconButton>
    </div>
  );
}

export function NowPlayingOverlay(): JSX.Element | null {
  const { isExpanded, engineState, currentSource, collapse, togglePlay, skipBack, seek } =
    usePlayer();

  if (!isExpanded) return null;
  if (engineState.currentTrack === null || currentSource === null) return null;

  const snapshot = engineState.currentTrack.snapshot;
  const isPlaying = engineState.status === "playing";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Now playing"
      data-testid="now-playing-overlay"
      style={{
        zIndex: "var(--z-modal)",
        animation: "overlay-slide-up var(--transition-normal) ease-out",
      }}
      className="fixed inset-0 bg-bg text-text flex flex-col px-6 py-4"
    >
      <div className="flex items-center justify-between h-8 shrink-0">
        <IconButton aria-label="Collapse player" onClick={collapse}>
          <Icon name="chevron-down" size={26} />
        </IconButton>
        <IconButton aria-label="More options">
          <Icon name="more-horizontal" size={22} />
        </IconButton>
      </div>

      <div className="flex flex-col flex-1 justify-center items-stretch min-h-0 px-2">
        {snapshot.kind === "station" ? (
          <StationVariant
            snapshot={snapshot}
            source={currentSource.source}
            externalId={currentSource.externalId}
            isPlaying={isPlaying}
            onTogglePlay={togglePlay}
            onSkipBack={skipBack}
          />
        ) : (
          <TrackVariant
            snapshot={snapshot}
            source={currentSource.source}
            externalId={currentSource.externalId}
            isPlaying={isPlaying}
            progressMs={engineState.progressMs}
            durationMs={engineState.durationMs}
            onTogglePlay={togglePlay}
            onSkipBack={skipBack}
            onSeek={seek}
          />
        )}
      </div>

      <div className="shrink-0 flex justify-end pt-4">
        <ProviderBadge source={currentSource.source} />
      </div>
    </div>
  );
}
