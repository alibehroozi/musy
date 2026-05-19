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

/**
 * Optional bucket-origin context for `playSnapshot`. When the play
 * starts from a bucket-detail page (feature 08), the page passes the
 * bucket's `{ id, kind }` so feature 06's skip-attribution can scope
 * the `bucket_song_scores` decrement to the originating bucket.
 *
 * Both fields are emitted together on the wire (DATA-21). Omit the
 * second arg entirely for plays that originate outside a bucket
 * (Search, Explore, direct resolve).
 */
export interface BucketOrigin {
  bucketId: string;
  bucketKind: "auto" | "custom";
}
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
  playSnapshot: (
    snapshot: SongSnapshot,
    source: ProviderName,
    externalId: string,
    bucketOrigin?: BucketOrigin,
  ) => void;
  /**
   * Resolve + play a snapshot without recording listening events. Used
   * by the Explore swipe deck where each top card auto-previews — the
   * swipe verdict is the signal, not the listen.
   */
  playPreview: (snapshot: SongSnapshot) => void;
  /**
   * Load a snapshot directly from a pre-resolved stream URL, bypassing the
   * /play/resolve HTTP call. Same no-recording contract as playPreview.
   * Synchronously calls `engine.load` (no fade, no RAF gating per UI-29)
   * so OS Media Session handlers reach `audio.play()` within their
   * gesture window (UI-31).
   */
  loadPreview: (snapshot: SongSnapshot, streamUrl: string) => void;
  /**
   * UI-32 (Bad Remix): rotates the underlying stream URL for the currently
   * loaded track without clearing `currentSource`. Same snapshot identity
   * and synchronous-load semantics as `loadPreview`, but the now-playing
   * overlay stays mounted because `currentSource` is preserved (the
   * overlay's visibility check requires it to be non-null).
   */
  swapStream: (snapshot: SongSnapshot, streamUrl: string) => void;
  togglePlay: () => void;
  /**
   * Pause the audio without clearing the loaded track. Used by Explore
   * to silence the just-swiped track when the deck drains while the
   * queue rebuilds (UI-26). The engine's `currentTrack` and the
   * navigator.mediaSession metadata are preserved so the next loaded
   * snapshot resumes through the same OS media session.
   */
  pause: () => void;
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
  swapStream: () => {},
  togglePlay: () => {},
  pause: () => {},
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
          // UI-39: hls.js intercepts the audio element's loading lifecycle,
          // so a 403 on the m3u8 manifest (or any other fatal HLS pipeline
          // failure) never fires the native "error" event on <audio>. We
          // promote fatal hls.js errors into a synthetic "error" event so
          // AudioEngine._handleError fires and UI-21's retry path kicks in.
          // Non-fatal errors are hls.js' own concern (auto-recovery) and
          // must NOT be propagated.
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              audio.dispatchEvent(new Event("error"));
            }
          });
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
    (
      snapshot: SongSnapshot,
      source: ProviderName,
      externalId: string,
      bucketOrigin?: BucketOrigin,
    ) => {
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

      // Feature 06 / DATA-21: when the play originates in a bucket,
      // both bucketId and bucketKind go on the wire together. Outside
      // a bucket, the fields are omitted entirely.
      const bucketBody = bucketOrigin
        ? { bucketId: bucketOrigin.bucketId, bucketKind: bucketOrigin.bucketKind }
        : {};

      resolveStream({ snapshot })
        .then((result) => {
          if (result.streamUrl === null) {
            setFailedTitle(`Couldn't play '${snapshot.title}'`);
            setEngineState((prev) => ({ ...prev, status: "failed" }));
            return;
          }

          engine.load(snapshot, result.streamUrl);

          if (isAuthed) {
            void recordPlayStarted({ source, externalId, snapshot, ...bucketBody }).catch(() => {});
          }

          // Listen for completion once per load.
          const offCompleted = engine.on("completed", (elapsedMs) => {
            offCompleted();
            if (isAuthed) {
              void recordPlayCompleted({
                source,
                externalId,
                snapshot,
                elapsedMs,
                ...bucketBody,
              }).catch(() => {});
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

  // UI-29: playPreview pauses the previously-loaded track synchronously
  // before the async resolve fetch starts. The user gets immediate silence
  // ("stop and wait") instead of the previous 250 ms fade-out that was
  // audibly leaking the old track into the resolve window. The previewGen
  // bumps here too so any in-flight load is invalidated before /play/resolve.
  const playPreview = useCallback((snapshot: SongSnapshot) => {
    const engine = engineRef.current;
    if (!engine) return;
    const gen = ++previewGenRef.current;
    engine.pause();
    setCurrentSource(null);
    setFailedTitle(null);
    setEngineState((prev) => ({
      ...prev,
      status: "loading",
      currentTrack: { snapshot, streamUrl: "" },
    }));
    if (audioRef.current) audioRef.current.volume = 1;
    void (async () => {
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
    })();
  }, []);

  // UI-29 + UI-31: synchronous load. `audio.src = newUrl` (or the hls.attachMedia
  // equivalent for HLS) implicitly stops the previously-loaded track, then
  // audio.play() starts the new one — all within the same microtask of the
  // call, so an OS Media Session handler reaches engine.load inside the
  // gesture window iOS Safari grants the handler. No RAF, no fade, no
  // async hop. Used by useTopCardPreview's cached fast-path, by UI-21's
  // retry, by Explore's on-screen ✕ / ♥ advance(), and by
  // ExploreMediaBridge's OS next/prev handlers.
  const loadPreview = useCallback((snapshot: SongSnapshot, streamUrl: string) => {
    const engine = engineRef.current;
    if (!engine) return;
    previewGenRef.current++;
    setCurrentSource(null);
    setFailedTitle(null);
    setEngineState((prev) => ({
      ...prev,
      status: "loading",
      currentTrack: { snapshot, streamUrl },
    }));
    if (audioRef.current) audioRef.current.volume = 1;
    engine.load(snapshot, streamUrl);
  }, []);

  // UI-32: Bad Remix — swap the underlying stream URL for the currently
  // active track without clearing `currentSource` (so the now-playing
  // overlay stays mounted; its visibility check requires `currentSource`
  // to be non-null). Snapshot identity is preserved; only the audio source
  // rotates. Same synchronous-load semantics as loadPreview (UI-29).
  const swapStream = useCallback((snapshot: SongSnapshot, streamUrl: string) => {
    const engine = engineRef.current;
    if (!engine) return;
    previewGenRef.current++;
    setFailedTitle(null);
    setEngineState((prev) => ({
      ...prev,
      status: "loading",
      currentTrack: { snapshot, streamUrl },
    }));
    if (audioRef.current) audioRef.current.volume = 1;
    engine.load(snapshot, streamUrl);
  }, []);

  const togglePlay = useCallback(() => {
    engineRef.current?.togglePlay();
  }, []);

  const pause = useCallback(() => {
    engineRef.current?.pause();
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
      swapStream,
      togglePlay,
      pause,
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
      swapStream,
      togglePlay,
      pause,
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
