import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SongSnapshot } from "@moc/contracts";
import { AudioEngine, type EngineState, type AudioInterface } from "@moc/web-core";
import { useAuthContext } from "../../contexts/AuthContext.js";
import { resolveStream, recordStarted, recordCompleted } from "./api.js";
import { useMediaSession } from "./useMediaSession.js";

export interface PlayerContextValue {
  engineState: EngineState;
  progressFraction: number;
  isExpanded: boolean;
  playSnapshot: (snapshot: SongSnapshot) => void;
  togglePlay: () => void;
  dismissFailed: () => void;
  expandPlayer: () => void;
  collapsePlayer: () => void;
  seekToFraction: (fraction: number) => void;
}

export const PlayerContext = createContext<PlayerContextValue | null>(null);

function makeAudioInterface(el: HTMLAudioElement): AudioInterface {
  return {
    setSrc(src: string) {
      el.src = src;
    },
    play() {
      return el.play();
    },
    pause() {
      el.pause();
    },
    get currentTime() {
      return el.currentTime;
    },
    get duration() {
      return el.duration;
    },
    seekTo(seconds: number) {
      el.currentTime = seconds;
    },
    on(event, cb) {
      el.addEventListener(event, cb);
      return () => el.removeEventListener(event, cb);
    },
  };
}

export function PlayerProvider({ children }: { children: ReactNode }): JSX.Element {
  const { state: authState } = useAuthContext();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const [engineState, setEngineState] = useState<EngineState>({ status: "idle" });
  const [progressFraction, setProgressFraction] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  const currentTrack = engineState.status !== "idle" ? engineState.ctx.track : null;

  useMediaSession(
    currentTrack,
    useCallback(() => engineRef.current?.togglePlay(), []),
    useCallback(() => engineRef.current?.seekToFraction(0), []),
  );

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    const engine = new AudioEngine(makeAudioInterface(audio));
    engineRef.current = engine;

    const unsubscribe = engine.on((ev) => {
      if (ev.type === "stateChange") {
        setEngineState(ev.state);
        setProgressFraction(ev.progressFraction);
        if (ev.state.status === "idle") {
          setIsExpanded(false);
        }
      } else if (ev.type === "started") {
        if (authState.status === "authenticated") {
          void recordStarted(ev.source, ev.externalId, ev.snapshot).catch(() => undefined);
        }
      } else if (ev.type === "completed") {
        if (authState.status === "authenticated") {
          void recordCompleted(ev.source, ev.externalId, ev.snapshot, ev.elapsedMs).catch(
            () => undefined,
          );
        }
      }
    });

    return () => {
      unsubscribe();
      engine.destroy();
      audio.pause();
      audio.src = "";
    };
  }, []);

  const playSnapshot = useCallback((snapshot: SongSnapshot) => {
    const engine = engineRef.current;
    if (!engine) return;

    // Immediately put the engine in loading state so the mini-player appears
    engine.load(snapshot, "", "", "");
    setEngineState({ status: "loading", ctx: { track: snapshot, source: "", sourceTrackId: "" } });

    void resolveStream(snapshot)
      .then((response) => {
        if (response.source === null || response.streamUrl === null) {
          engine.fail(`Couldn't play "${snapshot.title}"`);
          return;
        }
        engine.load(snapshot, response.streamUrl, response.sourceTrackId ?? "", response.source);
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof Error && err.message.includes("HTTP")
            ? "Couldn't reach the player service"
            : `Couldn't play "${snapshot.title}"`;
        engine.fail(msg);
      });
  }, []);

  const togglePlay = useCallback(() => {
    engineRef.current?.togglePlay();
  }, []);

  const dismissFailed = useCallback(() => {
    engineRef.current?.dismiss();
  }, []);

  const expandPlayer = useCallback(() => {
    setIsExpanded(true);
  }, []);

  const collapsePlayer = useCallback(() => {
    setIsExpanded(false);
  }, []);

  const seekToFraction = useCallback((fraction: number) => {
    engineRef.current?.seekToFraction(fraction);
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        engineState,
        progressFraction,
        isExpanded,
        playSnapshot,
        togglePlay,
        dismissFailed,
        expandPlayer,
        collapsePlayer,
        seekToFraction,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayerContext(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayerContext must be used inside <PlayerProvider>");
  return ctx;
}
