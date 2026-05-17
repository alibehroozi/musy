import type { TasteBucket } from "@moc/contracts";
import { Button, Typography } from "@moc/design-system";
import { gradientFor } from "./bucket-gradient.js";

interface BucketHeroProps {
  bucket: TasteBucket;
  songCount: number;
  /** Render the Play all button — caller decides based on state + count. */
  showPlayAll: boolean;
  onPlayAll: () => void;
}

/**
 * UI-37: hero block for the bucket-detail page. Cover (200×200, image
 * or deterministic gradient fallback) on top, bucket name as h1,
 * singular-aware "N song(s)" subtitle, and a full-width Play all
 * button gated by `showPlayAll`.
 *
 * The Play all button is rendered iff the bucket is `ready` AND the
 * song list is non-empty — the caller (`BucketDetailPage`) flips
 * `showPlayAll` accordingly.
 */
export function BucketHero({
  bucket,
  songCount,
  showPlayAll,
  onPlayAll,
}: BucketHeroProps): JSX.Element {
  return (
    <section className="flex flex-col items-center text-center px-6 py-2 pb-6">
      <Cover bucket={bucket} />
      <Typography variant="h1" className="mb-1 mt-4">
        {bucket.name}
      </Typography>
      <Typography variant="caption" className="text-text-muted mb-4">
        {songCount === 1 ? "1 song" : `${songCount} songs`}
      </Typography>
      {showPlayAll && (
        <Button
          variant="primary"
          size="lg"
          onClick={onPlayAll}
          aria-label="Play all"
          className="w-full"
          style={{ maxWidth: 280 }}
        >
          ▶ Play all
        </Button>
      )}
    </section>
  );
}

function Cover({ bucket }: { bucket: TasteBucket }): JSX.Element {
  if (bucket.coverArtworkUrl !== null) {
    return (
      <img
        src={bucket.coverArtworkUrl}
        alt={`Cover for ${bucket.name}`}
        className="rounded-md shadow-lg bg-surface object-cover"
        style={{ width: "200px", height: "200px" }}
        loading="lazy"
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={`Cover for ${bucket.name}`}
      className="rounded-md shadow-lg"
      style={{
        width: "200px",
        height: "200px",
        background: gradientFor(bucket.id),
      }}
    />
  );
}
