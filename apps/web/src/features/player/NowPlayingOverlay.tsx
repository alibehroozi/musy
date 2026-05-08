import { useEffect, useRef, useState } from "react";
import { IconButton, ProgressSlider } from "@moc/design-system";
import { formatProgress } from "@moc/web-core";
import { usePlayerContext } from "./PlayerProvider.js";

function CoverArt({ coverUrl, title }: { coverUrl?: string; title: string }): JSX.Element {
  if (coverUrl !== undefined) {
    return (
      <img
        src={coverUrl}
        alt=""
        aria-hidden
        className="rounded-lg object-cover"
        style={{ width: "min(280px, 75vw)", height: "min(280px, 75vw)" }}
      />
    );
  }
  return (
    <div
      aria-hidden
      className="rounded-lg bg-border flex items-center justify-center text-5xl font-bold text-text-muted"
      style={{ width: "min(280px, 75vw)", height: "min(280px, 75vw)" }}
    >
      {title.charAt(0).toUpperCase()}
    </div>
  );
}

export function NowPlayingOverlay(): JSX.Element | null {
  const { engineState, progressFraction, isExpanded, collapsePlayer, togglePlay, seekToFraction } =
    usePlayerContext();

  const [scrubFraction, setScrubFraction] = useState<number | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Collapse on browser back button
  useEffect(() => {
    if (!isExpanded) return;
    const handlePopState = () => collapsePlayer();
    window.addEventListener("popstate", handlePopState);
    // Push a history entry so back button can collapse the overlay
    history.pushState({ nowPlayingOpen: true }, "");
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isExpanded, collapsePlayer]);

  // Trap focus inside the overlay
  useEffect(() => {
    if (!isExpanded) return;
    const el = overlayRef.current;
    if (!el) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    // Move focus into overlay on open
    const firstFocusable = el.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    firstFocusable?.focus();
    return () => {
      prevFocus?.focus();
    };
  }, [isExpanded]);

  if (engineState.status === "idle" || !isExpanded) return null;

  const track = engineState.ctx.track;
  const isPlaying = engineState.status === "playing";
  const isStation = track.kind === "station";
  const durationMs = (track.durationSec ?? 0) * 1000;
  const displayFraction = scrubFraction ?? progressFraction;
  const progress = formatProgress(displayFraction * durationMs, durationMs);

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Now playing: ${track.title}`}
      className="fixed inset-0 flex flex-col bg-bg z-modal"
      style={{
        transform: isExpanded ? "translateY(0)" : "translateY(100%)",
        transition: "transform var(--transition-normal)",
      }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <IconButton
          icon="chevron-down"
          label="Collapse player"
          iconSize={24}
          onClick={collapsePlayer}
          className="text-text-muted"
        />
        <IconButton
          icon="more-horizontal"
          label="More options"
          iconSize={24}
          className="text-text-muted"
        />
      </div>

      {/* Cover art */}
      <div className="flex justify-center px-8 pt-4 pb-6">
        <CoverArt
          {...(track.coverUrl !== undefined ? { coverUrl: track.coverUrl } : {})}
          title={track.title}
        />
      </div>

      {/* Title + save */}
      <div className="flex items-center gap-3 px-6 pb-4">
        <div className="flex-1 min-w-0">
          <p className="text-xl font-semibold text-text truncate">{track.title}</p>
          <p className="text-sm text-text-muted truncate">{track.artist}</p>
        </div>
        <IconButton
          icon="heart"
          label="Save track"
          iconSize={22}
          className="text-text-muted shrink-0"
        />
      </div>

      {/* Progress or LIVE indicator */}
      <div className="px-6 pb-4">
        {isStation ? (
          <div className="flex items-center gap-2 h-10">
            <span
              className="size-2 rounded-full bg-danger shrink-0 motion-safe:animate-pulse"
              aria-hidden
            />
            <span className="text-sm font-semibold text-danger">LIVE</span>
          </div>
        ) : (
          <>
            <ProgressSlider
              valueFraction={displayFraction}
              onScrub={setScrubFraction}
              onScrubEnd={(f) => {
                setScrubFraction(null);
                seekToFraction(f);
              }}
              ariaLabel="Playback progress"
            />
            <div className="flex justify-between mt-1">
              <span className="text-xs text-text-muted">{progress.currentLabel}</span>
              <span className="text-xs text-text-muted">{progress.remainingLabel}</span>
            </div>
          </>
        )}
      </div>

      {/* Transport controls */}
      <div className="flex items-center justify-center gap-6 px-6 pb-8">
        <IconButton
          icon="skip-back"
          label="Skip to beginning"
          iconSize={28}
          aria-disabled={isStation || undefined}
          disabled={isStation}
          onClick={() => !isStation && seekToFraction(0)}
          className="size-14"
        />
        <IconButton
          icon={isPlaying ? "pause" : "play"}
          label={isPlaying ? "Pause" : "Play"}
          iconSize={36}
          onClick={togglePlay}
          className="size-16 bg-surface"
        />
        <IconButton
          icon="skip-forward"
          label="Skip forward"
          iconSize={28}
          aria-disabled={true}
          disabled
          className="size-14 opacity-40"
        />
      </div>
    </div>
  );
}
