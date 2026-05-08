import { useEffect, useRef } from "react";
import type { HistoryEntry } from "@moc/contracts";
import { Icon, ListItemButton } from "@moc/design-system";

const HISTORY_SKELETON_COUNT = 5;

function SkeletonHistoryRow(): JSX.Element {
  return (
    <div className="flex items-center gap-3 px-4 py-3 animate-pulse">
      <div className="size-4 rounded-full bg-border shrink-0" />
      <div className="h-4 rounded bg-border w-2/5" />
      <div className="ml-auto h-3 w-12 rounded bg-border" />
    </div>
  );
}

export function HistorySkeleton(): JSX.Element {
  return (
    <div aria-label="Loading history" data-testid="history-skeleton">
      {Array.from({ length: HISTORY_SKELETON_COUNT }).map((_, i) => (
        <SkeletonHistoryRow key={i} />
      ))}
    </div>
  );
}

function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}

interface HistoryListProps {
  entries: HistoryEntry[];
  hasMore: boolean;
  onSelect: (query: string) => void;
  onLoadMore: () => void;
}

export function HistoryList({
  entries,
  hasMore,
  onSelect,
  onLoadMore,
}: HistoryListProps): JSX.Element {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) onLoadMore();
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore]);

  return (
    <div data-testid="history-list">
      {entries.map((entry) => (
        <ListItemButton
          key={entry.id}
          onClick={() => onSelect(entry.query)}
          leading={
            <span className="text-text-muted">
              <Icon name="clock" size={16} />
            </span>
          }
          trailing={
            <span className="text-xs text-text-muted">
              {formatRelativeTime(entry.lastSearchedAt)}
            </span>
          }
        >
          <span className="text-sm">{entry.query}</span>
        </ListItemButton>
      ))}
      {hasMore && <div ref={sentinelRef} className="h-px" aria-hidden />}
    </div>
  );
}
