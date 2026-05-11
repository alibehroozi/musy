import type { SongSnapshot } from "@moc/contracts";

export type EngineStatus = "idle" | "loading" | "playing" | "paused" | "failed" | "ended";

export interface EngineState {
  status: EngineStatus;
  currentTrack: { snapshot: SongSnapshot; streamUrl: string } | null;
  progressMs: number;
  durationMs: number;
}

/** Minimal injectable interface so the engine is testable without a real <audio>. */
export interface AudioDriver {
  setSrc: (url: string) => void;
  play: () => Promise<void>;
  pause: () => void;
  /** Set playback position in seconds. The buffer may not yet cover the target;
   *  it's the caller/driver's responsibility to handle the resulting loading state. */
  seek: (positionSec: number) => void;
  on: (event: string, handler: () => void) => () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
}

type Unsubscribe = () => void;

type EngineEventMap = {
  stateChange: () => void;
  started: () => void;
  completed: (elapsedMs: number) => void;
  errored: () => void;
};

type EngineEventName = keyof EngineEventMap;

export class AudioEngine {
  private _status: EngineStatus = "idle";
  private _track: { snapshot: SongSnapshot; streamUrl: string } | null = null;
  private _progressMs = 0;
  private _durationMs = 0;
  private _startedAt: number | null = null;
  private readonly _listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  constructor(private readonly driver: AudioDriver) {
    driver.on("playing", () => this._handlePlaying());
    driver.on("pause", () => this._handlePause());
    driver.on("ended", () => this._handleEnded());
    driver.on("error", () => this._handleError());
    driver.on("timeupdate", () => this._handleTimeUpdate());
  }

  load(snapshot: SongSnapshot, streamUrl: string): void {
    this._track = { snapshot, streamUrl };
    this._status = "loading";
    this._progressMs = 0;
    this._durationMs = 0;
    this._startedAt = null;
    this.driver.setSrc(streamUrl);
    void this.driver.play().catch(() => {
      // The "error" event from the driver will handle this transition.
    });
    this._emit("stateChange");
  }

  togglePlay(): void {
    if (this._status === "playing") {
      this.driver.pause();
    } else if (this._status === "paused" || this._status === "ended") {
      this._status = "loading";
      this._emit("stateChange");
      void this.driver.play().catch(() => {});
    }
  }

  /**
   * Pause the audio without unloading the track. Idempotent: a no-op when
   * no track is loaded. Used by Explore to silence the just-swiped track
   * when the deck drains to zero items while the queue rebuilds (UI-26)
   * — the engine's `currentTrack` and the navigator.mediaSession metadata
   * are preserved so the next loaded snapshot resumes through the same
   * OS-level media session.
   */
  pause(): void {
    if (this._track === null) return;
    this.driver.pause();
    if (this._status === "playing" || this._status === "loading") {
      this._status = "paused";
      this._emit("stateChange");
    }
  }

  /**
   * Move playback to `positionMs`. Clamped to [0, durationMs]. No-op when no
   * track is loaded. Optimistically advances `progressMs` so the UI doesn't
   * snap back to the old position before the next `timeupdate` fires.
   */
  seek(positionMs: number): void {
    if (this._track === null) return;
    const duration = this._durationMs > 0 ? this._durationMs : Number.POSITIVE_INFINITY;
    const safe = !Number.isFinite(positionMs) ? 0 : Math.max(0, Math.min(positionMs, duration));
    this.driver.seek(safe / 1000);
    this._progressMs = safe;
    this._emit("stateChange");
  }

  get state(): EngineState {
    return {
      status: this._status,
      currentTrack: this._track,
      progressMs: this._progressMs,
      durationMs: this._durationMs,
    };
  }

  on<K extends EngineEventName>(event: K, handler: EngineEventMap[K]): Unsubscribe {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)!.add(handler as (...args: unknown[]) => void);
    return () => {
      this._listeners.get(event)?.delete(handler as (...args: unknown[]) => void);
    };
  }

  private _emit(event: "stateChange"): void;
  private _emit(event: "started"): void;
  private _emit(event: "completed", elapsedMs: number): void;
  private _emit(event: "errored"): void;
  private _emit(event: string, ...args: unknown[]): void {
    for (const handler of this._listeners.get(event) ?? []) {
      handler(...args);
    }
  }

  private _handlePlaying(): void {
    if (this._status === "loading") {
      this._startedAt = Date.now();
      this._emit("started");
    }
    this._status = "playing";
    this._emit("stateChange");
  }

  private _handlePause(): void {
    if (this._status === "playing") {
      this._status = "paused";
      this._emit("stateChange");
    }
  }

  private _handleEnded(): void {
    const elapsedMs = this._startedAt !== null ? Date.now() - this._startedAt : 0;
    this._status = "ended";
    this._emit("completed", elapsedMs);
    this._emit("stateChange");
  }

  private _handleError(): void {
    this._status = "failed";
    this._emit("errored");
    this._emit("stateChange");
  }

  private _handleTimeUpdate(): void {
    this._progressMs = this.driver.getCurrentTime() * 1000;
    this._durationMs = this.driver.getDuration() * 1000;
    this._emit("stateChange");
  }
}
