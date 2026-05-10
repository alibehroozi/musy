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
import Hls from "hls.js";
import { AudioEngine } from "@moc/web-core";
import type { AudioDriver, EngineState } from "@moc/web-core";
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

const NOOP_PLAYER_STATE: EngineState = {
  status: "idle",
  currentTrack: null,
  progressMs: 0,
  durationMs: 0,
};

const NOOP_CONTEXT: PlayerContextValue = {
  engineState: NOOP_PLAYER_STATE,
  failedTitle: null,
  currentSource: null,
  playSnapshot: () => {},
  togglePlay: () => {},
  dismissFailed: () => {},
};

export const PlayerContext = createContext<PlayerContextValue>(NOOP_CONTEXT);

export function PlayerProvider({ children }: { children: ReactNode }): JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const hlsRef = useRef<Hls | null>(null);
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

    const driver: AudioDriver = {
      setSrc: (url: string) => {
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
        // m3u8 = HLS stream; use hls.js on browsers that support MSE (Chrome, Firefox, Edge).
        // Safari supports HLS natively via the plain src assignment path below.
        if (/\.m3u8(\?|$)/.test(url) && Hls.isSupported()) {
          const hls = new Hls();
          hls.loadSource(url);
          hls.attachMedia(audio);
          hlsRef.current = hls;
        } else {
          audio.src = url;
        }
      },
      play: () => audio.play(),
      pause: () => audio.pause(),
      seek: (positionSec: number) => {
        audio.currentTime = positionSec;
      },
      on: (event: string, handler: () => void) => {
        audio.addEventListener(event, handler);
        return () => audio.removeEventListener(event, handler);
      },
      getCurrentTime: () => audio.currentTime,
      getDuration: () => (isFinite(audio.duration) ? audio.duration : 0),
    };

    const engine = new AudioEngine(driver);
    engineRef.current = engine;

    const offState = engine.on("stateChange", () => {
      setEngineState({ ...engine.state });
    });

    return () => {
      offState();
      audio.pause();
      audio.src = "";
      hlsRef.current?.destroy();
      hlsRef.current = null;
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
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
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
  return useContext(PlayerContext);
}
