import { useMemo, useState } from "react";
import type { TasteBucket } from "@moc/contracts";
import { Button, Typography } from "@moc/design-system";
import { useTasteProfile } from "./useTasteProfile.js";
import { BucketGrid } from "./components/BucketGrid.js";
import { EmptyState } from "./components/EmptyState.js";
import { MixModal } from "./components/MixModal.js";

export function TastePage(): JSX.Element {
  const { state, refresh, pollingStopped } = useTasteProfile();
  const [modalOpen, setModalOpen] = useState(false);

  const buckets = useMemo<TasteBucket[]>(() => {
    if (state.status !== "ready") return [];
    return orderByCreatedDesc(state.data.buckets, pollingStopped);
  }, [state, pollingStopped]);

  if (state.status === "loading") {
    return (
      <main className="flex items-center justify-center min-h-full p-8" aria-busy="true">
        <Typography variant="body" className="text-text-muted">
          Loading your taste…
        </Typography>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="flex flex-col items-center justify-center min-h-full p-8 gap-4">
        <Typography variant="body" className="text-text-muted">
          Couldn&apos;t load your taste.
        </Typography>
        <Button variant="primary" size="md" onClick={refresh}>
          Try again
        </Button>
      </main>
    );
  }

  if (buckets.length === 0) {
    return <EmptyState />;
  }

  return (
    <main className="flex flex-col min-h-full">
      <header className="sticky top-0 z-10 bg-bg flex items-center justify-between gap-3 px-4 py-4">
        <Typography variant="h1">Taste</Typography>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setModalOpen(true)}
          aria-label="New mix"
          className="min-h-9"
        >
          ✨ New mix
        </Button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <BucketGrid buckets={buckets} />
      </div>
      <MixModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          refresh();
        }}
      />
    </main>
  );
}

/**
 * UI-34: newest-first ordering by `createdAt`. UI-36: once polling has
 * stopped past the 2-minute mark, any still-`building` bucket gets the
 * `failed` visual locally — the server may catch up later, but the user
 * should never stare at a forever-shimmering card.
 */
function orderByCreatedDesc(buckets: TasteBucket[], pollingStopped: boolean): TasteBucket[] {
  const upgraded = pollingStopped
    ? buckets.map((b) =>
        b.state === "building"
          ? ({
              ...b,
              state: "failed" as const,
              errorReason: b.errorReason ?? "Mix failed to build",
            } satisfies TasteBucket)
          : b,
      )
    : buckets;
  return [...upgraded].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
