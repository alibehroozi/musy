import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AudioEngine } from "@moc/web-core";
import type { EngineState } from "@moc/web-core";
import type { ProviderName, SongSnapshot } from "@moc/contracts";
import { resolveStream, recordPlayStarted, recordPlayCompleted } from "./api.js";
import { useAuth } from "../../hooks/useAuth.js";

export interface PlayerContextValue {
  engineState: EngineState;
  /** Overrides engineState.status to "failed" when a custom fail message is set. */
  failedTitle: string | null;
  /** Source and externalId of the currently-loaded track (for overlay logic). */
  currentSource: { source: ProviderName; externalId: string } | null;
  playSnapshot: (snapshot: SongSnapshot, source: ProviderName, externalId: string) => void;
  togglePlay: () => void;
  dismissFailed: () => void;
}

export const PlayerContext = createContext<PlayerContextValue | null>(null);

function makeHtmlAudioDriver(el: HTMLAudioElement) {
  return {
    setSrc: (url: string) => {
      el.src = url;
    },
    play: () => el.play(),
    pause: () => el.pause(),
    on: (event: string, handler: () => void) => {
      el.addEventListener(event, handler);
      return () => el.removeEventListener(event, handler);
    },
    getCurrentTime: () => el.currentTime,
    getDuration: () => (isFinite(el.duration) ? el.duration : 0),
  };
}

export function PlayerProvider({ children }: { children: ReactNode }): JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const { state: authState } = useAuth();

  const [engineState, setEngineState] = useState<EngineState>({
    status: "idle",
    currentTrack: null,
    progressMs: 0,
    durationMs: 0,
  });
  const [currentSource, setCurrentSource] = useState<{
    source: ProviderName;
    externalId: string;
  } | null>(null);
  const [failedTitle, setFailedTitle] = useState<string | null>(null);

  // Initialize the audio element and engine once.
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    const engine = new AudioEngine(makeHtmlAudioDriver(audio));
    engineRef.current = engine;

    const offState = engine.on("stateChange", () => {
      setEngineState({ ...engine.state });
    });

    return () => {
      offState();
      audio.pause();
      audio.src = "";
    };
  }, []);

  const isAuthed = authState.status === "authenticated";

  const playSnapshot = useCallback(
    (snapshot: SongSnapshot, source: ProviderName, externalId: string) => {
      const engine = engineRef.current;
      if (!engine) return;

      setCurrentSource({ source, externalId });
      setFailedTitle(null);
      // Show loading state immediately while resolving.
      setEngineState((prev) => ({
        ...prev,
        status: "loading",
        currentTrack: { snapshot, streamUrl: "" },
      }));

      resolveStream({ snapshot })
        .then((result) => {
          if (result.streamUrl === null) {
            setFailedTitle(`Couldn't play '${snapshot.title}'`);
            setEngineState((prev) => ({ ...prev, status: "failed" }));
            return;
          }

          engine.load(snapshot, result.streamUrl);

          if (isAuthed) {
            void recordPlayStarted({ source, externalId, snapshot }).catch(() => {});
          }

          // Listen for completion once per load.
          const offCompleted = engine.on("completed", (elapsedMs) => {
            offCompleted();
            if (isAuthed) {
              void recordPlayCompleted({ source, externalId, snapshot, elapsedMs }).catch(() => {});
            }
          });
        })
        .catch(() => {
          setFailedTitle("Couldn't reach the player service");
          setEngineState((prev) => ({ ...prev, status: "failed" }));
        });
    },
    [isAuthed],
  );

  const togglePlay = useCallback(() => {
    engineRef.current?.togglePlay();
  }, []);

  const dismissFailed = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    setEngineState({
      status: "idle",
      currentTrack: null,
      progressMs: 0,
      durationMs: 0,
    });
    setCurrentSource(null);
    setFailedTitle(null);
  }, []);

  // Merge failedTitle into engineState's status so consumers see "failed".
  const effectiveState = useMemo<EngineState>(
    () => (failedTitle !== null ? { ...engineState, status: "failed" } : engineState),
    [engineState, failedTitle],
  );

  const value = useMemo<PlayerContextValue>(
    () => ({
      engineState: effectiveState,
      failedTitle,
      currentSource,
      playSnapshot,
      togglePlay,
      dismissFailed,
    }),
    [effectiveState, failedTitle, currentSource, playSnapshot, togglePlay, dismissFailed],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayerContext(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside <PlayerProvider>");
  return ctx;
}
