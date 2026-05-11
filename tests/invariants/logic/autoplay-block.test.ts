// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-24.

import { describe, it, expect, vi } from "vitest";
import { AudioEngine, isAutoplayBlocked } from "@moc/web-core";
import type { AudioDriver } from "@moc/web-core";
import type { SongSnapshot } from "@moc/contracts";

const SNAP: SongSnapshot = {
  title: "T",
  artist: "A",
  durationSec: 100,
  kind: "track",
};

function makeMockDriver(opts?: { playOutcomes?: Array<"ok" | "blocked" | "abort"> }): {
  driver: AudioDriver;
  fire: (event: string) => void;
  playCallCount: () => number;
  pauseCalled: () => boolean;
} {
  const handlers: Record<string, Set<() => void>> = {};
  let playCalls = 0;
  let pauseCalls = 0;
  const outcomes = opts?.playOutcomes ?? ["ok"];

  const driver: AudioDriver = {
    setSrc: vi.fn(),
    play: vi.fn(() => {
      const which = outcomes[playCalls] ?? outcomes[outcomes.length - 1] ?? "ok";
      playCalls++;
      if (which === "ok") return Promise.resolve();
      if (which === "blocked") {
        const e = new Error("autoplay blocked");
        e.name = "NotAllowedError";
        return Promise.reject(e);
      }
      const e = new Error("abort");
      e.name = "AbortError";
      return Promise.reject(e);
    }),
    pause: vi.fn(() => {
      pauseCalls++;
    }),
    seek: vi.fn(),
    on: (event: string, h: () => void) => {
      (handlers[event] ??= new Set()).add(h);
      return () => handlers[event]?.delete(h);
    },
    getCurrentTime: () => 0,
    getDuration: () => 0,
  };

  return {
    driver,
    fire: (event: string) => Array.from(handlers[event] ?? []).forEach((h) => h()),
    playCallCount: () => playCalls,
    pauseCalled: () => pauseCalls > 0,
  };
}

describe("LOGIC-24: engine handles browser-autoplay-block as load → paused", () => {
  it("isAutoplayBlocked returns true for an Error whose name is exactly 'NotAllowedError', false for any other shape", () => {
    const blocked = new Error("blocked");
    blocked.name = "NotAllowedError";
    expect(isAutoplayBlocked(blocked)).toBe(true);
    expect(isAutoplayBlocked({ name: "NotAllowedError" })).toBe(true);

    const abort = new Error("abort");
    abort.name = "AbortError";
    expect(isAutoplayBlocked(abort)).toBe(false);
    expect(isAutoplayBlocked(new Error("plain"))).toBe(false);
    expect(isAutoplayBlocked(null)).toBe(false);
    expect(isAutoplayBlocked(undefined)).toBe(false);
    expect(isAutoplayBlocked("NotAllowedError")).toBe(false);
    expect(isAutoplayBlocked({ name: "not-allowed-error" })).toBe(false);
  });

  it("engine.load → driver.play() rejects with NotAllowedError → engine transitions to 'paused' and emits autoplayBlocked + stateChange", async () => {
    const { driver } = makeMockDriver({ playOutcomes: ["blocked"] });
    const engine = new AudioEngine(driver);
    const autoplayBlocked = vi.fn();
    const stateChange = vi.fn();
    engine.on("autoplayBlocked", autoplayBlocked);
    engine.on("stateChange", stateChange);

    engine.load(SNAP, "https://stream/x");
    // Right after load: still loading; the rejection has not been awaited.
    expect(engine.state.status).toBe("loading");

    // Flush the microtask queue so the rejection's catch handler runs.
    await Promise.resolve();
    await Promise.resolve();

    expect(engine.state.status).toBe("paused");
    expect(autoplayBlocked).toHaveBeenCalledTimes(1);
    // One stateChange from load() (sync), one from the autoplay-block transition.
    expect(stateChange).toHaveBeenCalledTimes(2);
  });

  it("engine.load → driver.play() rejects with a non-autoplay error → engine stays in 'loading' so the existing error-event path can transition to 'failed'", async () => {
    const { driver, fire } = makeMockDriver({ playOutcomes: ["abort"] });
    const engine = new AudioEngine(driver);
    const autoplayBlocked = vi.fn();
    engine.on("autoplayBlocked", autoplayBlocked);

    engine.load(SNAP, "https://stream/x");
    await Promise.resolve();
    await Promise.resolve();

    // Non-NotAllowedError rejection → no autoplayBlocked emission, no state move.
    expect(engine.state.status).toBe("loading");
    expect(autoplayBlocked).not.toHaveBeenCalled();

    // The driver's "error" event still transitions to "failed" per LOGIC-08.
    fire("error");
    expect(engine.state.status).toBe("failed");
  });

  it("engine.load → driver fires 'error' BEFORE the play() rejection resolves → engine reaches 'failed'; the late NotAllowedError catch is a no-op", async () => {
    const { driver, fire } = makeMockDriver({ playOutcomes: ["blocked"] });
    const engine = new AudioEngine(driver);
    const autoplayBlocked = vi.fn();
    engine.on("autoplayBlocked", autoplayBlocked);

    engine.load(SNAP, "https://stream/x");
    // "error" fires before the rejection's microtask runs — engine reaches failed first.
    fire("error");
    expect(engine.state.status).toBe("failed");

    // Now flush the rejection — guard clause prevents the late transition.
    await Promise.resolve();
    await Promise.resolve();

    expect(engine.state.status).toBe("failed");
    expect(autoplayBlocked).not.toHaveBeenCalled();
  });

  it("togglePlay from 'paused' that calls driver.play() and is again rejected with NotAllowedError → engine returns to 'paused' (no infinite loading loop)", async () => {
    const { driver } = makeMockDriver({ playOutcomes: ["blocked", "blocked"] });
    const engine = new AudioEngine(driver);
    const autoplayBlocked = vi.fn();
    engine.on("autoplayBlocked", autoplayBlocked);

    engine.load(SNAP, "https://stream/x");
    await Promise.resolve();
    await Promise.resolve();
    expect(engine.state.status).toBe("paused");
    expect(autoplayBlocked).toHaveBeenCalledTimes(1);

    // togglePlay from paused → loading → play() rejects again → paused again.
    engine.togglePlay();
    expect(engine.state.status).toBe("loading");
    await Promise.resolve();
    await Promise.resolve();

    expect(engine.state.status).toBe("paused");
    expect(autoplayBlocked).toHaveBeenCalledTimes(2);
  });

  it("autoplayBlocked event fires exactly once per qualifying rejection — additional non-NotAllowedError rejections or successful play() calls do not emit it", async () => {
    const { driver, fire } = makeMockDriver({ playOutcomes: ["blocked", "ok", "ok"] });
    const engine = new AudioEngine(driver);
    const autoplayBlocked = vi.fn();
    engine.on("autoplayBlocked", autoplayBlocked);

    engine.load(SNAP, "https://stream/x");
    await Promise.resolve();
    await Promise.resolve();
    expect(autoplayBlocked).toHaveBeenCalledTimes(1);
    expect(engine.state.status).toBe("paused");

    // togglePlay → play() resolves cleanly this time → engine reaches playing via "playing" event.
    engine.togglePlay();
    await Promise.resolve();
    await Promise.resolve();
    fire("playing");
    expect(engine.state.status).toBe("playing");

    // Counter stays at 1.
    expect(autoplayBlocked).toHaveBeenCalledTimes(1);
  });
});
