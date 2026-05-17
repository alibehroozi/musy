import { useState } from "react";
import type { TasteBucket } from "@moc/contracts";
import { Button } from "@moc/design-system";

interface BucketCardProps {
  bucket: TasteBucket;
}

/**
 * UI-34: one card per bucket. Three variants by `state`:
 *   - "ready"    → cover (img or deterministic gradient) + name
 *   - "building" → shimmering surface + italic 'Building…' + optional
 *                  prompt caption (custom buckets only)
 *   - "failed"   → danger border + tap-to-toggle errorReason
 */
export function BucketCard({ bucket }: BucketCardProps): JSX.Element {
  if (bucket.state === "failed") return <FailedCard bucket={bucket} />;
  if (bucket.state === "building") return <BuildingCard bucket={bucket} />;
  return <ReadyCard bucket={bucket} />;
}

function ReadyCard({ bucket }: { bucket: TasteBucket }): JSX.Element {
  return (
    <div className="flex flex-col gap-2" role="listitem">
      <Cover bucket={bucket} />
      <div className="text-md font-semibold leading-tight line-clamp-2 text-text">
        {bucket.name}
      </div>
    </div>
  );
}

function BuildingCard({ bucket }: { bucket: TasteBucket }): JSX.Element {
  const showPrompt =
    bucket.kind === "custom" && bucket.promptText !== null && bucket.promptText.trim().length > 0;
  return (
    <div className="flex flex-col gap-2" role="listitem">
      <div
        role="img"
        aria-label="Bucket cover, building"
        className="w-full bg-surface rounded-md shadow-md taste-shimmer"
        style={{ aspectRatio: "1 / 1" }}
      />
      <div className="text-md italic font-normal leading-tight text-text-muted">Building…</div>
      {showPrompt && (
        <p className="text-xs text-text-muted italic -mt-1 line-clamp-1">
          &quot;{bucket.promptText}&quot;
        </p>
      )}
    </div>
  );
}

function FailedCard({ bucket }: { bucket: TasteBucket }): JSX.Element {
  const [showReason, setShowReason] = useState(false);
  const reason = bucket.errorReason ?? "Mix failed to build";
  return (
    <div className="flex flex-col gap-2" role="listitem">
      <Button
        variant="ghost"
        size="md"
        onClick={() => setShowReason((v) => !v)}
        aria-label={`Failed bucket ${bucket.name}: tap to ${showReason ? "hide" : "show"} reason`}
        aria-expanded={showReason}
        className="flex flex-col gap-2 p-0 hover:bg-transparent w-full text-left items-stretch"
      >
        <div
          aria-hidden
          className="w-full rounded-md shadow-md"
          style={{
            aspectRatio: "1 / 1",
            background: gradientFor(bucket.id),
            border: "2px solid var(--color-danger)",
          }}
        />
        <span className="text-md font-semibold leading-tight line-clamp-2 text-text">
          {bucket.name}
        </span>
      </Button>
      {showReason && (
        <p
          className="text-xs text-text-muted italic"
          role="status"
          data-testid={`bucket-error-${bucket.id}`}
        >
          {reason}
        </p>
      )}
    </div>
  );
}

function Cover({ bucket }: { bucket: TasteBucket }): JSX.Element {
  if (bucket.coverArtworkUrl !== null) {
    return (
      <img
        src={bucket.coverArtworkUrl}
        alt={`Cover for ${bucket.name}`}
        className="w-full rounded-md shadow-md bg-surface object-cover"
        style={{ aspectRatio: "1 / 1" }}
        loading="lazy"
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={`Cover for ${bucket.name}`}
      className="w-full rounded-md shadow-md"
      style={{
        aspectRatio: "1 / 1",
        background: gradientFor(bucket.id),
      }}
    />
  );
}

/**
 * Deterministic CSS gradient keyed by the bucket id hash. Same input
 * always produces the same gradient so a reload doesn't reshuffle the
 * grid's color palette. Five gradient families mirror the mockup.
 */
function gradientFor(bucketId: string): string {
  const PALETTE = [
    "linear-gradient(135deg, oklch(0.32 0.12 270), oklch(0.18 0.08 320))",
    "linear-gradient(135deg, oklch(0.55 0.18 320), oklch(0.35 0.12 340))",
    "linear-gradient(135deg, oklch(0.45 0.10 60), oklch(0.30 0.08 30))",
    "linear-gradient(135deg, oklch(0.40 0.12 200), oklch(0.25 0.08 230))",
    "linear-gradient(135deg, oklch(0.50 0.10 130), oklch(0.30 0.07 100))",
  ];
  let h = 0;
  for (let i = 0; i < bucketId.length; i++) {
    h = (h * 31 + bucketId.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(h) % PALETTE.length]!;
}
