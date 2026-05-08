const SKELETON_COUNT = 5;

function SkeletonRow(): JSX.Element {
  return (
    <div className="flex items-center gap-3 px-4 py-2 animate-pulse">
      <div className="size-14 rounded bg-border shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 rounded bg-border w-2/3" />
        <div className="h-3 rounded bg-border w-1/2" />
      </div>
      <div className="h-5 w-14 rounded-full bg-border" />
    </div>
  );
}

export function ResultsSkeleton(): JSX.Element {
  return (
    <div aria-label="Loading results" data-testid="results-skeleton">
      {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
