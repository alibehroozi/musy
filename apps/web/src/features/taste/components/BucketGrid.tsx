import type { TasteBucket } from "@moc/contracts";
import { BucketCard } from "./BucketCard.js";

interface BucketGridProps {
  buckets: TasteBucket[];
}

/**
 * UI-34: 2-column mobile-first grid. Cards are passed in createdAt-desc
 * order from the page; this component is purely structural.
 */
export function BucketGrid({ buckets }: BucketGridProps): JSX.Element {
  return (
    <div role="list" className="grid grid-cols-2 gap-4">
      {buckets.map((b) => (
        <BucketCard key={b.id} bucket={b} />
      ))}
    </div>
  );
}
