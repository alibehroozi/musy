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
  /** Shows a small play indicator overlay on the artwork. */
  playingOverlay?: boolean;
}

interface StationRowProps {
  variant: "station";
  name: string;
  country?: string | undefined;
  listenerCount?: number | undefined;
  artworkUrl?: string | undefined;
  sourceBadge: string;
  trailing?: ReactNode;
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
  playingOverlay?: boolean | undefined;
}

function Artwork({ url, title, playingOverlay }: ArtworkProps): JSX.Element {
  const overlay = playingOverlay ? (
    <div
      className="absolute inset-0 rounded flex items-center justify-center bg-black/40"
      aria-hidden
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="size-6 text-white"
        aria-hidden
      >
        <polygon points="5,3 19,12 5,21" />
      </svg>
    </div>
  ) : null;

  if (url !== undefined) {
    return (
      <div className="relative shrink-0 size-14">
        <img src={url} alt="" aria-hidden className="size-14 rounded object-cover" />
        {overlay}
      </div>
    );
  }
  return (
    <div className="relative shrink-0 size-14">
      <div
        aria-hidden
        className="size-14 rounded bg-surface flex items-center justify-center text-xl font-semibold text-text-muted"
      >
        {title.charAt(0).toUpperCase()}
      </div>
      {overlay}
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
    const { title, artist, year, duration, artworkUrl, sourceBadge, trailing, playingOverlay } =
      props;
    const meta = [artist, year, duration !== undefined ? formatDuration(duration) : undefined]
      .filter(Boolean)
      .join(" · ");
    return (
      <div className="flex items-center gap-3 px-4 py-2">
        <Artwork url={artworkUrl} title={title} playingOverlay={playingOverlay} />
        <div className="flex-1 min-w-0">
          <p className="text-md font-semibold text-text truncate">{title}</p>
          <p className="text-sm text-text-muted truncate">{meta}</p>
        </div>
        <SourceBadge label={sourceBadge} />
        {trailing}
      </div>
    );
  }

  const { name, country, listenerCount, artworkUrl, sourceBadge, trailing } = props;
  const meta = [
    country,
    listenerCount !== undefined ? `${listenerCount.toLocaleString()} listeners` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-surface/50 rounded">
      <Artwork url={artworkUrl} title={name} />
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
}
