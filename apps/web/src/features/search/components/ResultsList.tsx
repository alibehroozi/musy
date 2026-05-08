import { ResultRow } from "@moc/design-system";
import type { SearchResponse, TrackResult, StationResult } from "@moc/contracts";
import { usePlayerContext } from "../../player/PlayerProvider.js";

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

function snapshotFromTrack(result: TrackResult) {
  return {
    title: result.title,
    artist: result.artist,
    kind: "track" as const,
    ...(result.artworkUrl !== undefined ? { coverUrl: result.artworkUrl } : {}),
    ...(result.duration !== undefined ? { durationSec: result.duration } : {}),
  };
}

function snapshotFromStation(result: StationResult) {
  return {
    title: result.name,
    artist: "",
    kind: "station" as const,
    ...(result.favicon !== undefined ? { coverUrl: result.favicon } : {}),
  };
}

function TrackRow({
  result,
  isPlaying,
  onPlay,
}: {
  result: TrackResult;
  isPlaying: boolean;
  onPlay: () => void;
}): JSX.Element {
  return (
    <ResultRow
      variant="track"
      title={result.title}
      artist={result.artist}
      {...(result.duration !== undefined ? { duration: result.duration } : {})}
      {...(result.artworkUrl !== undefined ? { artworkUrl: result.artworkUrl } : {})}
      sourceBadge={providerLabel(result.provider)}
      playingOverlay={isPlaying}
      onClick={onPlay}
    />
  );
}

function StationRow({
  result,
  isPlaying,
  onPlay,
}: {
  result: StationResult;
  isPlaying: boolean;
  onPlay: () => void;
}): JSX.Element {
  return (
    <ResultRow
      variant="station"
      name={result.name}
      {...(result.country !== undefined ? { country: result.country } : {})}
      {...(result.favicon !== undefined ? { artworkUrl: result.favicon } : {})}
      sourceBadge={providerLabel(result.provider)}
      playingOverlay={isPlaying}
      onClick={onPlay}
    />
  );
}

export function ResultsList({ data }: ResultsListProps): JSX.Element {
  const { results, partial, failedProviders } = data;
  const { engineState, playSnapshot } = usePlayerContext();

  const currentId =
    engineState.status !== "idle"
      ? engineState.ctx.track.title + engineState.ctx.track.artist
      : null;

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
      {results.map((result) => {
        if (result.type === "track") {
          const snapshot = snapshotFromTrack(result);
          const isPlaying = currentId === snapshot.title + snapshot.artist;
          return (
            <TrackRow
              key={result.id}
              result={result}
              isPlaying={isPlaying}
              onPlay={() => playSnapshot(snapshot)}
            />
          );
        }
        const snapshot = snapshotFromStation(result);
        const isPlaying = currentId === snapshot.title + snapshot.artist;
        return (
          <StationRow
            key={result.id}
            result={result}
            isPlaying={isPlaying}
            onPlay={() => playSnapshot(snapshot)}
          />
        );
      })}
    </div>
  );
}
