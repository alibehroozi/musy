import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { TasteBucket } from "@moc/contracts";
import { Button } from "@moc/design-system";
import { gradientFor } from "./bucket-gradient.js";

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
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-2" role="listitem">
      <Button
        variant="ghost"
        size="md"
        onClick={() => navigate(`/taste/buckets/${bucket.id}`)}
        aria-label={`Open bucket ${bucket.name}`}
        className="flex flex-col gap-2 p-0 hover:bg-transparent w-full text-left items-stretch"
      >
        <Cover bucket={bucket} />
        <span className="text-md font-semibold leading-tight line-clamp-2 text-text">
          {bucket.name}
        </span>
      </Button>
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
