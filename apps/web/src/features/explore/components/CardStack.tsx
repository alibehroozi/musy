import { useState } from "react";
import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { Card, Typography } from "@moc/design-system";
import { directionFromDrag } from "@moc/web-core";
import type { SongSnapshot, SwipeDirection } from "@moc/contracts";
import { usePlayer } from "../../player/usePlayer.js";

const SWIPE_THRESHOLD = 100;

interface CardStackProps {
  /** First entry is the top card; entries 2..N are stacked behind. */
  items: SongSnapshot[];
  onSwipe: (direction: SwipeDirection) => void;
  overlay?: React.ReactNode;
}

export function CardStack({ items, onSwipe, overlay }: CardStackProps): JSX.Element | null {
  const { engineState } = usePlayer();
  // Render up to 3 cards (top + 2 behind) — fewer when the queue is short.
  const visible = items.slice(0, 3);
  if (visible.length === 0) return null;

  const progressFraction =
    engineState.durationMs > 0 ? Math.min(1, engineState.progressMs / engineState.durationMs) : 0;
  const isLoadingPreview = engineState.status === "loading";

  return (
    <div data-testid="explore-card-stack" className="relative flex-1 m-4">
      {/* Render back-to-front so the top card is last in the DOM and
          receives pointer events first. */}
      {visible
        .map((snap, i) => ({ snap, i }))
        .reverse()
        .map(({ snap, i }) => {
          const isTop = i === 0;
          return (
            <SwipeCard
              key={`${snap.title}|${snap.artist}|${i}`}
              snapshot={snap}
              isTop={isTop}
              depth={i}
              onSwipe={onSwipe}
              overlay={isTop ? overlay : undefined}
              {...(isTop ? { progressFraction, isLoadingPreview } : {})}
            />
          );
        })}
    </div>
  );
}

interface SwipeCardProps {
  snapshot: SongSnapshot;
  isTop: boolean;
  depth: number;
  onSwipe: (direction: SwipeDirection) => void;
  overlay?: React.ReactNode;
  progressFraction?: number;
  isLoadingPreview?: boolean;
}

function SwipeCard({
  snapshot,
  isTop,
  depth,
  onSwipe,
  overlay,
  progressFraction,
  isLoadingPreview,
}: SwipeCardProps): JSX.Element {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-12, 0, 12]);
  const likeOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const passOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0]);
  const [exitDirection, setExitDirection] = useState<SwipeDirection | null>(null);

  const baseScale = 1 - depth * 0.06;
  const baseY = depth * 10;
  const baseOpacity = 1 - depth * 0.45;

  function handleDragEnd(_e: unknown, info: PanInfo): void {
    const dir = directionFromDrag({
      dx: info.offset.x,
      dy: info.offset.y,
      threshold: SWIPE_THRESHOLD,
    });
    if (dir === null) {
      // Snap back — controlled by `animate={x: 0}` via the drag spring.
      return;
    }
    setExitDirection(dir);
    onSwipe(dir);
  }

  // Top card is draggable. Behind cards are static at scale/translate +
  // opacity 0.55. They render only the artwork (no text) — text rendered
  // through the opacity layer drops below WCAG AA contrast (axe-core
  // measures effective contrast, not the un-multiplied source colors),
  // and there's no UX value in unreadable peeking labels anyway.
  if (!isTop) {
    return (
      <motion.div
        data-explore-position="behind"
        aria-hidden
        initial={false}
        animate={{ scale: baseScale, y: baseY, opacity: baseOpacity }}
        transition={{ type: "spring", stiffness: 200, damping: 30 }}
        className="absolute inset-0"
      >
        <CardArtwork snapshot={snapshot} />
      </motion.div>
    );
  }

  return (
    <motion.div
      data-explore-position="top"
      data-testid="explore-top-card"
      drag={exitDirection === null ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      style={{ x, rotate }}
      initial={{ scale: 0.94, y: 10, opacity: 0.55 }}
      animate={
        exitDirection === "right"
          ? { x: 600, opacity: 0 }
          : exitDirection === "left"
            ? { x: -600, opacity: 0 }
            : { scale: 1, y: 0, opacity: 1 }
      }
      transition={{ type: "spring", stiffness: 220, damping: 30 }}
      onDragEnd={handleDragEnd}
      className="absolute inset-0 cursor-grab active:cursor-grabbing"
    >
      <CardContent
        snapshot={snapshot}
        {...(progressFraction !== undefined ? { progressFraction, isLoadingPreview } : {})}
      />
      {overlay !== undefined && overlay}
      <motion.div
        data-testid="explore-like-stamp"
        style={{ opacity: likeOpacity, rotate: -12 }}
        className="pointer-events-none absolute top-6 left-6 px-3 py-1 border-2 border-success text-success font-bold text-xl rounded-md"
      >
        LIKE
      </motion.div>
      <motion.div
        data-testid="explore-pass-stamp"
        style={{ opacity: passOpacity, rotate: 12 }}
        className="pointer-events-none absolute top-6 right-6 px-3 py-1 border-2 border-danger text-danger font-bold text-xl rounded-md"
      >
        PASS
      </motion.div>
    </motion.div>
  );
}

function CardContent({
  snapshot,
  progressFraction,
  isLoadingPreview,
}: {
  snapshot: SongSnapshot;
  progressFraction?: number;
  isLoadingPreview?: boolean;
}): JSX.Element {
  return (
    <Card className="h-full flex flex-col gap-3 p-4">
      <CardArtwork snapshot={snapshot} />
      <div className="flex flex-col gap-1">
        <Typography variant="h3" className="truncate">
          {snapshot.title}
        </Typography>
        <Typography variant="body" className="truncate text-text">
          {snapshot.artist}
        </Typography>
      </div>
      {progressFraction !== undefined && (
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-1 bg-border"
        >
          <div
            className={`h-full bg-primary transition-all duration-100${isLoadingPreview === true ? " animate-pulse" : ""}`}
            style={{ width: `${Math.round(progressFraction * 100)}%` }}
          />
        </div>
      )}
    </Card>
  );
}

function CardArtwork({ snapshot }: { snapshot: SongSnapshot }): JSX.Element {
  return (
    <div
      data-testid="explore-artwork"
      className="flex-1 min-h-0 rounded-md overflow-hidden bg-border"
      role="img"
      aria-label={
        snapshot.coverUrl !== undefined ? `${snapshot.title} cover art` : "Artwork unavailable"
      }
    >
      {snapshot.coverUrl !== undefined && (
        <img src={snapshot.coverUrl} alt="" className="size-full object-cover" />
      )}
    </div>
  );
}
