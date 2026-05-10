import { useCallback, useRef, useState, type PointerEvent } from "react";

export interface ProgressSliderProps {
  /** Current playback position as a fraction in [0, 1]. */
  valueFraction: number;
  /** Required accessible name (e.g. "Playback position"). */
  ariaLabel: string;
  /**
   * Fired continuously while the user drags. The audio is NOT seeked here —
   * the parent typically uses this to update the displayed currentLabel.
   */
  onScrub?: (fraction: number) => void;
  /**
   * Fired exactly once on pointerup / pointercancel after a drag. The parent
   * commits the audio seek here. Commit-on-release is the iOS pattern:
   * live-seeking while dragging is jarring on mobile.
   */
  onScrubEnd?: (fraction: number) => void;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function fractionFromEvent(track: HTMLDivElement, clientX: number): number {
  const rect = track.getBoundingClientRect();
  if (rect.width === 0) return 0;
  return clamp01((clientX - rect.left) / rect.width);
}

/**
 * Drag-to-seek slider. Pointer-driven so it works for mouse + touch.
 * Purely presentational — the parent maps the fraction to currentTime.
 */
export function ProgressSlider({
  valueFraction,
  ariaLabel,
  onScrub,
  onScrubEnd,
}: ProgressSliderProps): JSX.Element {
  const trackRef = useRef<HTMLDivElement | null>(null);
  // Ref-driven so synchronous pointer events (and tests) always read the latest
  // drag state regardless of React render timing.
  const isDraggingRef = useRef<boolean>(false);
  const [dragFraction, setDragFraction] = useState<number | null>(null);

  const displayed = dragFraction ?? clamp01(valueFraction);
  const percent = `${(displayed * 100).toFixed(2)}%`;

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const track = trackRef.current;
      if (!track) return;
      track.setPointerCapture(e.pointerId);
      isDraggingRef.current = true;
      const f = fractionFromEvent(track, e.clientX);
      setDragFraction(f);
      onScrub?.(f);
    },
    [onScrub],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      const track = trackRef.current;
      if (!track) return;
      const f = fractionFromEvent(track, e.clientX);
      setDragFraction(f);
      onScrub?.(f);
    },
    [onScrub],
  );

  const finishDrag = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      const track = trackRef.current;
      if (!track) return;
      const f = fractionFromEvent(track, e.clientX);
      setDragFraction(null);
      onScrubEnd?.(f);
    },
    [onScrubEnd],
  );

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(displayed * 100)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      data-testid="progress-slider"
      className="relative h-3 cursor-pointer touch-none select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-border" />
      <div
        className="absolute left-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-primary"
        style={{ width: percent }}
        aria-hidden
      />
      <div
        className="absolute top-1/2 size-3 -translate-y-1/2 -translate-x-1/2 rounded-full bg-text shadow"
        style={{ left: percent }}
        aria-hidden
      />
    </div>
  );
}
