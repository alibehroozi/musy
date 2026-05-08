import type { SongSnapshot } from "@moc/contracts";

/**
 * Minimal interface over HTMLAudioElement so the engine is testable with a mock.
 * `on` returns a cleanup function; call it to unsubscribe.
 */
export interface AudioInterface {
  setSrc(src: string): void;
  play(): Promise<void>;
  pause(): void;
  readonly currentTime: number;
  readonly duration: number;
  on(event: "playing" | "ended" | "error" | "timeupdate", cb: () => void): () => void;
}

export interface TrackContext {
  track: SongSnapshot;
  source: string;
  sourceTrackId: string;
}

export type EngineState =
  | { status: "idle" }
  | { status: "loading"; ctx: TrackContext }
  | { status: "playing"; ctx: TrackContext }
  | { status: "paused"; ctx: TrackContext }
  | { status: "failed"; ctx: TrackContext; errorMsg?: string };

export type EngineEvent =
  | { type: "started"; source: string; externalId: string; snapshot: SongSnapshot }
  | {
      type: "completed";
      source: string;
      externalId: string;
      snapshot: SongSnapshot;
      elapsedMs: number;
    }
  | { type: "stateChange"; state: EngineState; progressFraction: number };

export class AudioEngine {
  private _state: EngineState = { status: "idle" };
  private _playStartedAt = 0;
  private readonly _listeners = new Set<(ev: EngineEvent) => void>();
  private readonly _cleanups: Array<() => void> = [];

  constructor(private readonly audio: AudioInterface) {
    this._cleanups.push(audio.on("playing", () => this._onPlaying()));
    this._cleanups.push(audio.on("ended", () => this._onEnded()));
    this._cleanups.push(audio.on("error", () => this._onError()));
    this._cleanups.push(audio.on("timeupdate", () => this._onTimeUpdate()));
  }

  get state(): EngineState {
    return this._state;
  }

  get progressFraction(): number {
    const dur = this.audio.duration;
    if (dur > 0 && Number.isFinite(dur)) {
      return this.audio.currentTime / dur;
    }
    return 0;
  }

  load(track: SongSnapshot, streamUrl: string, sourceTrackId: string, source: string): void {
    this.audio.setSrc(streamUrl);
    this._state = { status: "loading", ctx: { track, source, sourceTrackId } };
    this._emitStateChange();
    void this.audio.play().catch(() => {
      // errors surface via the 'error' event on the audio element
    });
  }

  fail(errorMsg?: string): void {
    const ctx: TrackContext =
      this._state.status !== "idle" && this._state.status !== "failed"
        ? this._state.ctx
        : { track: { title: "", artist: "", kind: "track" }, source: "", sourceTrackId: "" };
    this._state =
      errorMsg !== undefined ? { status: "failed", ctx, errorMsg } : { status: "failed", ctx };
    this._emitStateChange();
  }

  togglePlay(): void {
    if (this._state.status === "playing") {
      this.audio.pause();
      this._state = { status: "paused", ctx: this._state.ctx };
      this._emitStateChange();
    } else if (this._state.status === "paused") {
      void this.audio.play().catch(() => {});
      this._state = { status: "playing", ctx: this._state.ctx };
      this._emitStateChange();
    }
  }

  dismiss(): void {
    this._state = { status: "idle" };
    this._emitStateChange();
  }

  on(cb: (ev: EngineEvent) => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  destroy(): void {
    for (const cleanup of this._cleanups) cleanup();
    this._cleanups.length = 0;
    this._listeners.clear();
  }

  private _emit(ev: EngineEvent): void {
    for (const cb of this._listeners) cb(ev);
  }

  private _emitStateChange(): void {
    this._emit({
      type: "stateChange",
      state: this._state,
      progressFraction: this.progressFraction,
    });
  }

  private _onPlaying(): void {
    if (this._state.status === "loading") {
      const { ctx } = this._state;
      this._playStartedAt = Date.now();
      this._state = { status: "playing", ctx };
      this._emit({
        type: "started",
        source: ctx.source,
        externalId: ctx.sourceTrackId,
        snapshot: ctx.track,
      });
      this._emitStateChange();
    } else if (this._state.status === "paused") {
      this._state = { status: "playing", ctx: this._state.ctx };
      this._emitStateChange();
    }
  }

  private _onEnded(): void {
    if (this._state.status === "playing") {
      const { ctx } = this._state;
      const elapsedMs = Date.now() - this._playStartedAt;
      this._state = { status: "paused", ctx };
      this._emit({
        type: "completed",
        source: ctx.source,
        externalId: ctx.sourceTrackId,
        snapshot: ctx.track,
        elapsedMs,
      });
      this._emitStateChange();
    }
  }

  private _onError(): void {
    if (this._state.status === "idle" || this._state.status === "failed") return;
    const ctx = this._state.ctx;
    this._state = { status: "failed", ctx };
    this._emitStateChange();
  }

  private _onTimeUpdate(): void {
    this._emitStateChange();
  }
}
