import type { ReactNode } from "react";

interface TrackRowProps {
  variant: "track";
  title: string;
  artist: string;
  year?: number | undefined;
  duration?: number | undefined;
  artworkUrl?: string | undefined;
  sourceBadge: string;
  trailing?: ReactNode;
  playingOverlay?: boolean;
  onClick?: () => void;
}

interface StationRowProps {
  variant: "station";
  name: string;
  country?: string | undefined;
  listenerCount?: number | undefined;
  artworkUrl?: string | undefined;
  sourceBadge: string;
  trailing?: ReactNode;
  playingOverlay?: boolean;
  onClick?: () => void;
}

export type ResultRowProps = TrackRowProps | StationRowProps;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface ArtworkProps {
  url?: string | undefined;
  title: string;
  playing: boolean;
}

function Artwork({ url, title, playing }: ArtworkProps): JSX.Element {
  const base = "relative size-14 rounded shrink-0";
  const img =
    url !== undefined ? (
      <img src={url} alt="" aria-hidden className="size-14 rounded object-cover shrink-0" />
    ) : (
      <div
        aria-hidden
        className="size-14 rounded bg-surface flex items-center justify-center text-xl font-semibold text-text-muted shrink-0"
      >
        {title.charAt(0).toUpperCase()}
      </div>
    );

  if (!playing) return <div className={base}>{img}</div>;

  return (
    <div className={base} data-playing="true">
      {img}
      <div
        aria-hidden
        className="absolute inset-0 rounded bg-black/55 flex items-center justify-center text-text"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <polygon points="5,3 19,12 5,21" />
        </svg>
      </div>
    </div>
  );
}

function SourceBadge({ label }: { label: string }): JSX.Element {
  return (
    <span className="shrink-0 rounded-full bg-border px-3 py-1 text-xs text-text-muted capitalize">
      {label}
    </span>
  );
}

export function ResultRow(props: ResultRowProps): JSX.Element {
  if (props.variant === "track") {
    const {
      title,
      artist,
      year,
      duration,
      artworkUrl,
      sourceBadge,
      trailing,
      playingOverlay,
      onClick,
    } = props;
    const meta = [artist, year, duration !== undefined ? formatDuration(duration) : undefined]
      .filter(Boolean)
      .join(" · ");
    const row = (
      <div className="flex items-center gap-3 px-4 py-2">
        <Artwork
          {...(artworkUrl !== undefined ? { url: artworkUrl } : {})}
          title={title}
          playing={playingOverlay === true}
        />
        <div className="flex-1 min-w-0">
          <p className="text-md font-semibold text-text truncate">{title}</p>
          <p className="text-sm text-text-muted truncate">{meta}</p>
        </div>
        <SourceBadge label={sourceBadge} />
        {trailing}
      </div>
    );
    if (onClick !== undefined) {
      return (
        <button type="button" onClick={onClick} className="block w-full text-left">
          {row}
        </button>
      );
    }
    return row;
  }

  const {
    name,
    country,
    listenerCount,
    artworkUrl,
    sourceBadge,
    trailing,
    playingOverlay,
    onClick,
  } = props;
  const meta = [
    country,
    listenerCount !== undefined ? `${listenerCount.toLocaleString()} listeners` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  const row = (
    <div className="flex items-center gap-3 px-4 py-2 bg-surface/50 rounded">
      <Artwork
        {...(artworkUrl !== undefined ? { url: artworkUrl } : {})}
        title={name}
        playing={playingOverlay === true}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-md font-semibold text-text truncate">{name}</p>
          <span
            role="img"
            aria-label="Live"
            className="shrink-0 size-2 rounded-full bg-danger"
            data-testid="live-indicator"
          />
        </div>
        <p className="text-sm text-text-muted truncate">{meta}</p>
      </div>
      <SourceBadge label={sourceBadge} />
      {trailing}
    </div>
  );
  if (onClick !== undefined) {
    return (
      <button type="button" onClick={onClick} className="block w-full text-left">
        {row}
      </button>
    );
  }
  return row;
}
