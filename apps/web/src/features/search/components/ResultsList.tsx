import { type KeyboardEvent, useCallback, useState } from "react";
import { ResultRow } from "@moc/design-system";
import type {
  ProviderName,
  SearchResponse,
  SongSnapshot,
  StationResult,
  TrackResult,
} from "@moc/contracts";
import { useInterestActions } from "../useInterestActions.js";
import { SaveButton } from "./SaveButton.js";
import { SignInModal } from "./SignInModal.js";

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

function trackSnapshot(t: TrackResult): SongSnapshot {
  return {
    title: t.title,
    artist: t.artist,
    kind: "track",
    ...(t.artworkUrl !== undefined ? { coverUrl: t.artworkUrl } : {}),
    ...(t.duration !== undefined ? { durationSec: t.duration } : {}),
  };
}

function stationSnapshot(s: StationResult): SongSnapshot {
  return {
    title: s.name,
    artist: s.country ?? "",
    kind: "station",
    ...(s.favicon !== undefined ? { coverUrl: s.favicon } : {}),
  };
}

interface InteractiveRowProps {
  source: ProviderName;
  externalId: string;
  snapshot: SongSnapshot;
  onExplore: (id: { source: ProviderName; externalId: string; snapshot: SongSnapshot }) => void;
  onSave: (id: { source: ProviderName; externalId: string; snapshot: SongSnapshot }) => void;
  children: (saveButton: JSX.Element) => JSX.Element;
}

function InteractiveRow({
  source,
  externalId,
  snapshot,
  onExplore,
  onSave,
  children,
}: InteractiveRowProps): JSX.Element {
  const [flashing, setFlashing] = useState(false);
  const [saved, setSaved] = useState(false);

  const triggerFlash = useCallback(() => {
    setFlashing(true);
    window.setTimeout(() => setFlashing(false), 200);
  }, []);

  const handleExplore = useCallback(() => {
    triggerFlash();
    onExplore({ source, externalId, snapshot });
  }, [triggerFlash, onExplore, source, externalId, snapshot]);

  const handleSave = useCallback(() => {
    setSaved(true);
    onSave({ source, externalId, snapshot });
  }, [onSave, source, externalId, snapshot]);

  const handleKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleExplore();
    }
  };

  // --transition-fast (100ms) per the spec; flash is bg-primary/10 → bg-bg
  const baseClasses = "transition-colors cursor-pointer outline-none focus-visible:bg-border";
  const flashClasses = flashing ? "bg-primary/10" : "bg-bg";
  const cls = `${baseClasses} ${flashClasses}`;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleExplore}
      onKeyDown={handleKey}
      className={cls}
      style={{ transitionDuration: "var(--transition-fast)" }}
      data-testid="interactive-row"
    >
      {children(<SaveButton saved={saved} onSave={handleSave} />)}
    </div>
  );
}

export function ResultsList({ data }: ResultsListProps): JSX.Element {
  const { results, partial, failedProviders } = data;
  const { signInOpen, closeSignIn, onExplore, onSave } = useInterestActions();

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
    <>
      <div data-testid="results-list">
        {results.map((result) =>
          result.type === "track" ? (
            <InteractiveRow
              key={result.id}
              source={result.provider}
              externalId={result.providerId}
              snapshot={trackSnapshot(result)}
              onExplore={onExplore}
              onSave={onSave}
            >
              {(saveButton) => (
                <ResultRow
                  variant="track"
                  title={result.title}
                  artist={result.artist}
                  {...(result.duration !== undefined ? { duration: result.duration } : {})}
                  {...(result.artworkUrl !== undefined ? { artworkUrl: result.artworkUrl } : {})}
                  sourceBadge={providerLabel(result.provider)}
                  trailing={saveButton}
                />
              )}
            </InteractiveRow>
          ) : (
            <InteractiveRow
              key={result.id}
              source={result.provider}
              externalId={result.providerId}
              snapshot={stationSnapshot(result)}
              onExplore={onExplore}
              onSave={onSave}
            >
              {(saveButton) => (
                <ResultRow
                  variant="station"
                  name={result.name}
                  {...(result.country !== undefined ? { country: result.country } : {})}
                  {...(result.favicon !== undefined ? { artworkUrl: result.favicon } : {})}
                  sourceBadge={providerLabel(result.provider)}
                  trailing={saveButton}
                />
              )}
            </InteractiveRow>
          ),
        )}
      </div>
      <SignInModal open={signInOpen} onClose={closeSignIn} />
    </>
  );
}
