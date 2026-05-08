import { ResultRow } from "@moc/design-system";
import type { SearchResponse, TrackResult, StationResult } from "@moc/contracts";

interface ResultsListProps {
  data: SearchResponse;
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

function TrackRow({ result }: { result: TrackResult }): JSX.Element {
  return (
    <ResultRow
      variant="track"
      title={result.title}
      artist={result.artist}
      year={undefined}
      duration={result.duration}
      artworkUrl={result.artworkUrl}
      sourceBadge={providerLabel(result.provider)}
    />
  );
}

function StationRow({ result }: { result: StationResult }): JSX.Element {
  return (
    <ResultRow
      variant="station"
      name={result.name}
      country={result.country}
      artworkUrl={result.favicon}
      sourceBadge={providerLabel(result.provider)}
    />
  );
}

export function ResultsList({ data }: ResultsListProps): JSX.Element {
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
          <TrackRow key={result.id} result={result} />
        ) : (
          <StationRow key={result.id} result={result} />
        ),
      )}
    </div>
  );
}
