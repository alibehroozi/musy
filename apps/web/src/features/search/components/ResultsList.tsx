import { useState, useCallback } from "react";
import { ResultRow } from "@moc/design-system";
import type { SearchResponse, TrackResult, StationResult, SearchResult } from "@moc/contracts";
import { SaveButton } from "./SaveButton.js";

interface ResultsListProps {
  data: SearchResponse;
  onRowTap: (result: SearchResult) => void;
  onSave: (result: SearchResult) => void;
}

function providerLabel(provider: string): string {
  const map: Record<string, string> = {
    audius: "Audius",
    deezer: "Deezer",
    "radio-browser": "Radio",
    genius: "Genius",
  };
  return map[provider] ?? provider;
}

interface InteractiveRowProps {
  onTap: () => void;
  children: React.ReactNode;
}

function InteractiveRow({ onTap, children }: InteractiveRowProps): JSX.Element {
  const [flashing, setFlashing] = useState(false);

  const handleClick = useCallback(() => {
    setFlashing(true);
    setTimeout(() => setFlashing(false), 200);
    onTap();
  }, [onTap]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleClick();
      }}
      className={[
        "transition-colors duration-[var(--transition-fast)] cursor-pointer",
        flashing ? "bg-primary/10" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      {children}
    </div>
  );
}

function TrackRow({
  result,
  onTap,
  onSave,
}: {
  result: TrackResult;
  onTap: () => void;
  onSave: () => void;
}): JSX.Element {
  return (
    <InteractiveRow onTap={onTap}>
      <ResultRow
        variant="track"
        title={result.title}
        artist={result.artist}
        {...(result.duration !== undefined ? { duration: result.duration } : {})}
        {...(result.artworkUrl !== undefined ? { artworkUrl: result.artworkUrl } : {})}
        sourceBadge={providerLabel(result.provider)}
        trailing={<SaveButton onSave={onSave} />}
      />
    </InteractiveRow>
  );
}

function StationRow({
  result,
  onTap,
  onSave,
}: {
  result: StationResult;
  onTap: () => void;
  onSave: () => void;
}): JSX.Element {
  return (
    <InteractiveRow onTap={onTap}>
      <ResultRow
        variant="station"
        name={result.name}
        {...(result.country !== undefined ? { country: result.country } : {})}
        {...(result.favicon !== undefined ? { artworkUrl: result.favicon } : {})}
        sourceBadge={providerLabel(result.provider)}
        trailing={<SaveButton onSave={onSave} />}
      />
    </InteractiveRow>
  );
}

export function ResultsList({ data, onRowTap, onSave }: ResultsListProps): JSX.Element {
  const { results, partial, failedProviders } = data;

  if (results.length === 0) {
    return (
      <div className="px-4 py-8 text-center space-y-1">
        <p className="text-text">No results found. Try a different query.</p>
        {partial && failedProviders.length > 0 && (
          <p className="text-sm text-text-muted">Unavailable: {failedProviders.join(", ")}</p>
        )}
      </div>
    );
  }

  return (
    <div data-testid="results-list">
      {results.map((result) =>
        result.type === "track" ? (
          <TrackRow
            key={result.id}
            result={result}
            onTap={() => onRowTap(result)}
            onSave={() => onSave(result)}
          />
        ) : (
          <StationRow
            key={result.id}
            result={result}
            onTap={() => onRowTap(result)}
            onSave={() => onSave(result)}
          />
        ),
      )}
    </div>
  );
}
