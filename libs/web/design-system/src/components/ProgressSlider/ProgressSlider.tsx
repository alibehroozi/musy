import { useRef, useCallback } from "react";

export interface ProgressSliderProps {
  valueFraction: number;
  onScrub: (fraction: number) => void;
  onScrubEnd: (fraction: number) => void;
  ariaLabel: string;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function ProgressSlider({
  valueFraction,
  onScrub,
  onScrubEnd,
  ariaLabel,
}: ProgressSliderProps): JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const fractionAt = useCallback((clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return clamp((clientX - rect.left) / rect.width, 0, 1);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      dragging.current = true;
      // setPointerCapture may be absent in test environments (jsdom)
      (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
      const f = fractionAt(e.clientX);
      onScrub(f);
    },
    [fractionAt, onScrub],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      onScrub(fractionAt(e.clientX));
    },
    [fractionAt, onScrub],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      dragging.current = false;
      onScrubEnd(fractionAt(e.clientX));
    },
    [fractionAt, onScrubEnd],
  );

  const handlePointerCancel = useCallback(() => {
    dragging.current = false;
  }, []);

  const clamped = clamp(valueFraction, 0, 1);

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label={ariaLabel}
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      className="relative h-10 flex items-center cursor-pointer select-none touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {/* Track background */}
      <div className="absolute left-0 right-0 h-1 rounded-full bg-border" aria-hidden />
      {/* Fill */}
      <div
        className="absolute left-0 h-1 rounded-full bg-primary"
        style={{ width: `${clamped * 100}%` }}
        aria-hidden
      />
      {/* Thumb */}
      <div
        className="absolute size-4 rounded-full bg-primary shadow-sm -translate-x-1/2"
        style={{ left: `${clamped * 100}%` }}
        aria-hidden
      />
    </div>
  );
}
