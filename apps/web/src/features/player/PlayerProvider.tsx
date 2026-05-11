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
import { useMediaSession } from "./useMediaSession.js";

export interface PlayerContextValue {
  engineState: EngineState;
  /** Overrides engineState.status to "failed" when a custom fail message is set. */
  failedTitle: string | null;
  /** Source and externalId of the currently-loaded track (for overlay logic). */
  currentSource: { source: ProviderName; externalId: string } | null;
  /** Whether the now-playing overlay is currently expanded. */
  isExpanded: boolean;
  playSnapshot: (snapshot: SongSnapshot, source: ProviderName, externalId: string) => void;
  /**
   * Resolve + play a snapshot without recording listening events. Used
   * by the Explore swipe deck where each top card auto-previews — the
   * swipe verdict is the signal, not the listen.
   */
  playPreview: (snapshot: SongSnapshot) => void;
  /**
   * Load a snapshot directly from a pre-resolved stream URL, bypassing the
   * /play/resolve HTTP call. Same no-recording contract as playPreview.
   * Fades out the current audio before loading the new track.
   */
  loadPreview: (snapshot: SongSnapshot, streamUrl: string) => void;
  togglePlay: () => void;
  /** Seek to an absolute position in milliseconds. */
  seek: (positionMs: number) => void;
  /** Skip-back in v1: rewind to 0 (no queue). */
  skipBack: () => void;
  /**
   * Register handlers for the OS media-session "next" and "prev" buttons.
   * While registered, these override the default player behaviour (prev = rewind).
   * Returns a cleanup function that restores the defaults — call it in useEffect.
   *
   * Designed for the Explore page: next = like, prev = pass.
   */
  registerMediaOverrides: (handlers: {
    onNext: (() => void) | null;
    onPrev: (() => void) | null;
  }) => () => void;
  expand: () => void;
  collapse: () => void;
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
  isExpanded: false,
  playSnapshot: () => {},
  playPreview: () => {},
  loadPreview: () => {},
  togglePlay: () => {},
  seek: () => {},
  skipBack: () => {},
  registerMediaOverrides: () => () => {},
  expand: () => {},
  collapse: () => {},
  dismissFailed: () => {},
};

export const PlayerContext = createContext<PlayerContextValue>(NOOP_CONTEXT);

const OVERLAY_HISTORY_STATE = "now-playing-overlay";

export function PlayerProvider({ children }: { children: ReactNode }): JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  // Each playPreview/loadPreview call increments this; resolve callbacks
  // check it so stale results from swiped-past cards are discarded.
  const previewGenRef = useRef(0);
  // requestAnimationFrame handle for the volume-fade animation.
  const fadeRafRef = useRef<number | null>(null);
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [mediaOverrides, setMediaOverrides] = useState<{
    onNext: (() => void) | null;
    onPrev: (() => void) | null;
  }>({ onNext: null, onPrev: null });

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
      if (fadeRafRef.current !== null) {
        cancelAnimationFrame(fadeRafRef.current);
        fadeRafRef.current = null;
      }
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

  // Animate audio.volume from its current level to 0 over durationMs.
  // Skipped when no audio is meaningfully loaded (src empty or already ended).
  // Cancels any in-flight fade so concurrent calls don't fight each other.
  const fadeOutAudio = useCallback((durationMs: number): Promise<void> => {
    return new Promise((resolve) => {
      const audio = audioRef.current;
      if (!audio || audio.src === "" || audio.ended || audio.volume === 0) {
        if (audio) audio.volume = 1;
        resolve();
        return;
      }
      if (fadeRafRef.current !== null) {
        cancelAnimationFrame(fadeRafRef.current);
        fadeRafRef.current = null;
      }
      const startVolume = audio.volume;
      const startTime = performance.now();
      const step = (now: number): void => {
        const a = audioRef.current;
        if (!a) {
          resolve();
          return;
        }
        const elapsed = now - startTime;
        // Clamp to [0,1]: RAF timestamps can be slightly earlier than the
        // performance.now() captured at startTime, making elapsed negative
        // on the first frame and producing volume > 1 without the lower clamp.
        const progress = Math.max(0, Math.min(1, elapsed / durationMs));
        a.volume = startVolume * (1 - progress);
        if (progress < 1) {
          fadeRafRef.current = requestAnimationFrame(step);
        } else {
          a.volume = 0;
          fadeRafRef.current = null;
          resolve();
        }
      };
      fadeRafRef.current = requestAnimationFrame(step);
    });
  }, []);

  const playPreview = useCallback(
    (snapshot: SongSnapshot) => {
      const engine = engineRef.current;
      if (!engine) return;
      const gen = ++previewGenRef.current;

      void fadeOutAudio(250).then(async () => {
        if (previewGenRef.current !== gen) return;
        setCurrentSource(null);
        setFailedTitle(null);
        setEngineState((prev) => ({
          ...prev,
          status: "loading",
          currentTrack: { snapshot, streamUrl: "" },
        }));
        if (audioRef.current) audioRef.current.volume = 1;
        try {
          const result = await resolveStream({ snapshot });
          if (previewGenRef.current !== gen) return;
          if (result.streamUrl === null) {
            setFailedTitle(`Couldn't play '${snapshot.title}'`);
            setEngineState((prev) => ({ ...prev, status: "failed" }));
            return;
          }
          engine.load(snapshot, result.streamUrl);
        } catch {
          if (previewGenRef.current !== gen) return;
          setFailedTitle("Couldn't reach the player service");
          setEngineState((prev) => ({ ...prev, status: "failed" }));
        }
      });
    },
    [fadeOutAudio],
  );

  // Load a pre-resolved stream URL directly, bypassing /play/resolve.
  // Same no-recording contract as playPreview; includes the volume-dip crossfade.
  const loadPreview = useCallback(
    (snapshot: SongSnapshot, streamUrl: string) => {
      const engine = engineRef.current;
      if (!engine) return;
      const gen = ++previewGenRef.current;

      void fadeOutAudio(250).then(() => {
        if (previewGenRef.current !== gen) return;
        setCurrentSource(null);
        setFailedTitle(null);
        setEngineState((prev) => ({
          ...prev,
          status: "loading",
          currentTrack: { snapshot, streamUrl },
        }));
        if (audioRef.current) audioRef.current.volume = 1;
        engine.load(snapshot, streamUrl);
      });
    },
    [fadeOutAudio],
  );

  const togglePlay = useCallback(() => {
    engineRef.current?.togglePlay();
  }, []);

  const seek = useCallback((positionMs: number) => {
    engineRef.current?.seek(positionMs);
  }, []);

  const skipBack = useCallback(() => {
    engineRef.current?.seek(0);
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
    setIsExpanded(false);
  }, []);

  const registerMediaOverrides = useCallback(
    (handlers: { onNext: (() => void) | null; onPrev: (() => void) | null }) => {
      setMediaOverrides(handlers);
      return () => {
        setMediaOverrides({ onNext: null, onPrev: null });
      };
    },
    [],
  );

  // Push a history entry on expand so the browser back-button collapses
  // the overlay instead of navigating the underlying route. Pop the entry
  // when collapsing programmatically (chevron-down) so history stays clean.
  const expand = useCallback(() => {
    setIsExpanded((prev) => {
      if (prev) return prev;
      try {
        window.history.pushState({ overlay: OVERLAY_HISTORY_STATE }, "");
      } catch {
        // history.pushState fails in very old browsers; the overlay still works.
      }
      return true;
    });
  }, []);

  const collapse = useCallback(() => {
    setIsExpanded((prev) => {
      if (!prev) return prev;
      try {
        const state = window.history.state as { overlay?: string } | null;
        if (state && state.overlay === OVERLAY_HISTORY_STATE) {
          window.history.back();
        }
      } catch {
        // Same fallback — visual close still happens.
      }
      return false;
    });
  }, []);

  // popstate fires on browser-back. If the overlay is currently expanded,
  // the back removes our pushed entry — collapse the overlay (without
  // calling history.back() again) instead of letting the route change.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onPop = (): void => {
      setIsExpanded(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Merge failedTitle into engineState's status so consumers see "failed".
  const effectiveState = useMemo<EngineState>(
    () => (failedTitle !== null ? { ...engineState, status: "failed" } : engineState),
    [engineState, failedTitle],
  );

  const currentSnapshot = effectiveState.currentTrack?.snapshot ?? null;
  const isPlaying = effectiveState.status === "playing";

  useMediaSession({
    snapshot: currentSnapshot,
    isPlaying,
    onPlayPause: togglePlay,
    onPrev: mediaOverrides.onPrev ?? skipBack,
    onNext: mediaOverrides.onNext,
  });

  const value = useMemo<PlayerContextValue>(
    () => ({
      engineState: effectiveState,
      failedTitle,
      currentSource,
      isExpanded,
      playSnapshot,
      playPreview,
      loadPreview,
      togglePlay,
      seek,
      skipBack,
      registerMediaOverrides,
      expand,
      collapse,
      dismissFailed,
    }),
    [
      effectiveState,
      failedTitle,
      currentSource,
      isExpanded,
      playSnapshot,
      playPreview,
      loadPreview,
      togglePlay,
      seek,
      skipBack,
      registerMediaOverrides,
      expand,
      collapse,
      dismissFailed,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayerContext(): PlayerContextValue {
  return useContext(PlayerContext);
}
