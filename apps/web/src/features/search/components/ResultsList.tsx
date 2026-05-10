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
import { usePlayer } from "../../player/usePlayer.js";
import { useAuth } from "../../../hooks/useAuth.js";
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
    soundcloud: "SoundCloud",
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
  exploreLabel: string;
  isPlaying: boolean;
  onExplore: (id: { source: ProviderName; externalId: string; snapshot: SongSnapshot }) => void;
  onPlay: (id: { source: ProviderName; externalId: string; snapshot: SongSnapshot }) => void;
  onSave: (id: { source: ProviderName; externalId: string; snapshot: SongSnapshot }) => void;
  children: JSX.Element;
}

/**
 * Visual flash + click target for the row. The SaveButton sits as a
 * sibling below (absolutely positioned over the trailing slot) so it
 * is NOT a descendant of the role=button — keeping the DOM free of
 * nested-interactive a11y violations.
 */
function InteractiveRow({
  source,
  externalId,
  snapshot,
  exploreLabel,
  isPlaying,
  onExplore,
  onPlay,
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
    onPlay({ source, externalId, snapshot });
  }, [triggerFlash, onExplore, onPlay, source, externalId, snapshot]);

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
      className="relative"
      data-testid="interactive-row-wrapper"
      {...(isPlaying ? { "data-playing": "true" } : {})}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={exploreLabel}
        onClick={handleExplore}
        onKeyDown={handleKey}
        className={cls}
        style={{ transitionDuration: "var(--transition-fast)" }}
        data-testid="interactive-row"
      >
        {children}
      </div>
      <div className="absolute right-4 top-1/2 -translate-y-1/2">
        <SaveButton saved={saved} onSave={handleSave} />
      </div>
    </div>
  );
}

export function ResultsList({ data }: ResultsListProps): JSX.Element {
  const { results, partial, failedProviders } = data;
  const { signInOpen, closeSignIn, onExplore, onSave } = useInterestActions();
  const { playSnapshot, currentSource } = usePlayer();
  const { state: authState } = useAuth();

  const isAuthed = authState.status === "authenticated";

  const onPlay = useCallback(
    ({
      source,
      externalId,
      snapshot,
    }: {
      source: ProviderName;
      externalId: string;
      snapshot: SongSnapshot;
    }) => {
      if (isAuthed) {
        playSnapshot(snapshot, source, externalId);
      }
    },
    [isAuthed, playSnapshot],
  );

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

  // Spacer reserves room in ResultRow's trailing slot for the absolutely
  // positioned SaveButton — keeps the visual layout intact while the
  // SaveButton lives outside the role=button subtree (avoids
  // nested-interactive a11y violations).
  const trailingSpacer = <div className="size-11 shrink-0" aria-hidden />;

  return (
    <>
      <div data-testid="results-list">
        {results.map((result) => {
          const isPlaying =
            currentSource !== null &&
            currentSource.source === result.provider &&
            currentSource.externalId === result.providerId;

          return result.type === "track" ? (
            <InteractiveRow
              key={result.id}
              source={result.provider}
              externalId={result.providerId}
              snapshot={trackSnapshot(result)}
              exploreLabel={`Explore ${result.title} by ${result.artist}`}
              isPlaying={isPlaying}
              onExplore={onExplore}
              onPlay={onPlay}
              onSave={onSave}
            >
              <ResultRow
                variant="track"
                title={result.title}
                artist={result.artist}
                {...(result.duration !== undefined ? { duration: result.duration } : {})}
                {...(result.artworkUrl !== undefined ? { artworkUrl: result.artworkUrl } : {})}
                sourceBadge={providerLabel(result.provider)}
                trailing={trailingSpacer}
                playingOverlay={isPlaying}
              />
            </InteractiveRow>
          ) : (
            <InteractiveRow
              key={result.id}
              source={result.provider}
              externalId={result.providerId}
              snapshot={stationSnapshot(result)}
              exploreLabel={`Explore ${result.name}`}
              isPlaying={isPlaying}
              onExplore={onExplore}
              onPlay={onPlay}
              onSave={onSave}
            >
              <ResultRow
                variant="station"
                name={result.name}
                {...(result.country !== undefined ? { country: result.country } : {})}
                {...(result.favicon !== undefined ? { artworkUrl: result.favicon } : {})}
                sourceBadge={providerLabel(result.provider)}
                trailing={trailingSpacer}
              />
            </InteractiveRow>
          );
        })}
      </div>
      <SignInModal open={signInOpen} onClose={closeSignIn} />
    </>
  );
}
