// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-11, LOGIC-12.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AudioEngine, formatProgress } from "@moc/web-core";
import type { AudioDriver } from "@moc/web-core";
import type { SongSnapshot } from "@moc/contracts";

// ─── LOGIC-11 ────────────────────────────────────────────────────────────────

describe("LOGIC-11: formatProgress(currentMs, durationMs) is deterministic and total", () => {
  it("returns fraction in [0, 1] for normal inputs and m:ss labels", () => {
    const r = formatProgress(83_000, 246_000); // 1:23 of 4:06
    expect(r.fraction).toBeGreaterThan(0);
    expect(r.fraction).toBeLessThanOrEqual(1);
    expect(r.currentLabel).toBe("1:23");
    expect(r.remainingLabel).toBe("-2:43");
  });

  it("collapses durationMs <= 0, NaN, and non-finite inputs to { 0, '0:00', '-0:00' }", () => {
    const expected = { fraction: 0, currentLabel: "0:00", remainingLabel: "-0:00" };
    expect(formatProgress(0, 0)).toEqual(expected);
    expect(formatProgress(50, 0)).toEqual(expected);
    expect(formatProgress(0, -1)).toEqual(expected);
    expect(formatProgress(Number.NaN, 100_000)).toEqual(expected);
    expect(formatProgress(0, Number.NaN)).toEqual(expected);
    expect(formatProgress(0, Number.POSITIVE_INFINITY)).toEqual(expected);
  });

  it("clamps fraction to 1 and remainingLabel to '-0:00' when currentMs >= durationMs", () => {
    const r = formatProgress(999_999, 60_000);
    expect(r.fraction).toBe(1);
    expect(r.currentLabel).toBe("1:00");
    expect(r.remainingLabel).toBe("-0:00");
  });

  it("uses h:mm:ss when durationMs >= 1 hour", () => {
    const r = formatProgress(3_725_000, 7_200_000); // 1:02:05 of 2:00:00
    expect(r.currentLabel).toBe("1:02:05");
    expect(r.remainingLabel).toBe("-0:57:55");
  });

  it("is deterministic — same inputs produce same outputs across calls", () => {
    const a = formatProgress(45_000, 180_000);
    const b = formatProgress(45_000, 180_000);
    expect(a).toEqual(b);
  });
});

// ─── LOGIC-12 ────────────────────────────────────────────────────────────────

const TRACK: SongSnapshot = { title: "Get Lucky", artist: "Daft Punk", kind: "track" };

function makeMockDriver() {
  const handlers = new Map<string, Set<() => void>>();
  const driver: AudioDriver = {
    setSrc: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    seek: vi.fn(),
    on: vi.fn((event: string, handler: () => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
      return () => handlers.get(event)?.delete(handler);
    }),
    getCurrentTime: vi.fn().mockReturnValue(0),
    getDuration: vi.fn().mockReturnValue(180), // 3 minutes
  };
  const emit = (event: string): void => {
    for (const h of handlers.get(event) ?? []) h();
  };
  return { driver, emit };
}

describe("LOGIC-12: AudioEngine.seek(positionMs)", () => {
  let driver: AudioDriver;
  let emit: (event: string) => void;
  let engine: AudioEngine;

  beforeEach(() => {
    const mock = makeMockDriver();
    driver = mock.driver;
    emit = mock.emit;
    engine = new AudioEngine(driver);
  });

  it("calls driver.seek with the equivalent seconds", () => {
    engine.load(TRACK, "https://stream.example/track.mp3");
    emit("playing");
    emit("timeupdate"); // populates durationMs from getDuration() -> 180s -> 180_000ms

    engine.seek(60_000);
    expect(vi.mocked(driver.seek)).toHaveBeenCalledWith(60);
    expect(engine.state.progressMs).toBe(60_000);
  });

  it("clamps positionMs to [0, durationMs] before applying", () => {
    engine.load(TRACK, "https://stream.example/track.mp3");
    emit("playing");
    emit("timeupdate"); // durationMs = 180_000

    engine.seek(-5000);
    expect(vi.mocked(driver.seek)).toHaveBeenLastCalledWith(0);
    expect(engine.state.progressMs).toBe(0);

    engine.seek(999_999);
    expect(vi.mocked(driver.seek)).toHaveBeenLastCalledWith(180);
    expect(engine.state.progressMs).toBe(180_000);
  });

  it("emits exactly one stateChange per seek call", () => {
    engine.load(TRACK, "https://stream.example/track.mp3");
    emit("playing");
    emit("timeupdate");

    const stateChanges = vi.fn();
    engine.on("stateChange", stateChanges);

    engine.seek(30_000);
    expect(stateChanges).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when no track is loaded (does not call driver.seek)", () => {
    // Fresh engine, never loaded.
    engine.seek(10_000);
    expect(vi.mocked(driver.seek)).not.toHaveBeenCalled();
    expect(engine.state.progressMs).toBe(0);
  });
});
