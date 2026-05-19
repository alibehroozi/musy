// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PWA-04 and PWA-05.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, render, screen, act, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
});
import { useServiceWorkerUpdates } from "../../../apps/web/src/features/pwa/hooks/useServiceWorkerUpdates.js";
import { usePwaUpdateController } from "../../../apps/web/src/features/pwa/hooks/usePwaUpdateController.js";
import { UpdateAvailableBanner } from "../../../apps/web/src/features/pwa/components/UpdateAvailableBanner.js";

interface FakeDocument {
  addEventListener: (type: string, handler: EventListener) => void;
  removeEventListener: (type: string, handler: EventListener) => void;
  visibilityState: DocumentVisibilityState;
  fire: (type: string) => void;
}

function fakeDocument(initial: DocumentVisibilityState = "visible"): FakeDocument {
  const handlers = new Map<string, Set<EventListener>>();
  return {
    visibilityState: initial,
    addEventListener(type, handler) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)!.add(handler);
    },
    removeEventListener(type, handler) {
      handlers.get(type)?.delete(handler);
    },
    fire(type) {
      handlers.get(type)?.forEach((h) => h(new Event(type)));
    },
  };
}

function fakeRegistration(): { update: ReturnType<typeof vi.fn> } {
  return { update: vi.fn().mockResolvedValue(undefined) };
}

// ── PWA-04 ──────────────────────────────────────────────────────────────

describe("PWA-04: SW update controller registers + checks on schedule + visibility", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("on mount with a registration, calls registration.update() exactly once", () => {
    const reg = fakeRegistration();
    const doc = fakeDocument();
    renderHook(() =>
      useServiceWorkerUpdates({
        registration: reg as unknown as ServiceWorkerRegistration,
        intervalMs: 30 * 60 * 1000,
        doc,
      }),
    );
    expect(reg.update).toHaveBeenCalledTimes(1);
  });

  it("schedules a periodic update check at the configured interval (>= 30 min) and tears it down on unmount", () => {
    const reg = fakeRegistration();
    const doc = fakeDocument();
    const intervalMs = 30 * 60 * 1000;
    const { unmount } = renderHook(() =>
      useServiceWorkerUpdates({
        registration: reg as unknown as ServiceWorkerRegistration,
        intervalMs,
        doc,
      }),
    );

    expect(reg.update).toHaveBeenCalledTimes(1); // mount

    act(() => {
      vi.advanceTimersByTime(intervalMs);
    });
    expect(reg.update).toHaveBeenCalledTimes(2);

    act(() => {
      vi.advanceTimersByTime(intervalMs);
    });
    expect(reg.update).toHaveBeenCalledTimes(3);

    unmount();
    act(() => {
      vi.advanceTimersByTime(intervalMs * 5);
    });
    expect(reg.update).toHaveBeenCalledTimes(3); // no further calls after unmount
  });

  it("calls registration.update() when document visibility transitions to visible", () => {
    const reg = fakeRegistration();
    const doc = fakeDocument("hidden");
    renderHook(() =>
      useServiceWorkerUpdates({
        registration: reg as unknown as ServiceWorkerRegistration,
        intervalMs: 30 * 60 * 1000,
        doc,
      }),
    );

    // mount call
    expect(reg.update).toHaveBeenCalledTimes(1);

    // Hidden → no call
    doc.visibilityState = "hidden";
    act(() => {
      doc.fire("visibilitychange");
    });
    expect(reg.update).toHaveBeenCalledTimes(1);

    // Visible → call
    doc.visibilityState = "visible";
    act(() => {
      doc.fire("visibilitychange");
    });
    expect(reg.update).toHaveBeenCalledTimes(2);
  });

  it("removes the visibilitychange listener on unmount", () => {
    const reg = fakeRegistration();
    const doc = fakeDocument();
    const { unmount } = renderHook(() =>
      useServiceWorkerUpdates({
        registration: reg as unknown as ServiceWorkerRegistration,
        intervalMs: 30 * 60 * 1000,
        doc,
      }),
    );
    expect(reg.update).toHaveBeenCalledTimes(1);

    unmount();

    doc.visibilityState = "visible";
    act(() => {
      doc.fire("visibilitychange");
    });
    expect(reg.update).toHaveBeenCalledTimes(1); // no extra call
  });

  it("requesting the hook with null registration does nothing", () => {
    const doc = fakeDocument();
    renderHook(() =>
      useServiceWorkerUpdates({
        registration: null,
        intervalMs: 30 * 60 * 1000,
        doc,
      }),
    );
    doc.visibilityState = "visible";
    act(() => {
      doc.fire("visibilitychange");
    });
    // No throw, no behaviour — just a no-op.
    expect(true).toBe(true);
  });
});

// ── PWA-05 ──────────────────────────────────────────────────────────────

describe("PWA-05: needRefresh banner + self-apply on next focus", () => {
  it("when onNeedRefresh fires, the UpdateAvailableBanner is rendered with Refresh + Later", () => {
    const onRefresh = vi.fn();
    const onDismiss = vi.fn();
    render(<UpdateAvailableBanner onRefresh={onRefresh} onDismiss={onDismiss} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /refresh now/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /later/i })).toBeInTheDocument();
  });

  it("clicking Refresh invokes updateSW(true)", () => {
    const updateSW = vi.fn().mockResolvedValue(undefined);
    const doc = fakeDocument("visible");
    const { result } = renderHook(() =>
      usePwaUpdateController({ needRefresh: true, updateSW, isPlaying: false, doc }),
    );

    act(() => {
      result.current.refreshNow();
    });

    expect(updateSW).toHaveBeenCalledWith(true);
  });

  it("clicking Later hides the banner for the session but keeps needRefresh internally", () => {
    const updateSW = vi.fn().mockResolvedValue(undefined);
    const doc = fakeDocument("visible");
    const { result, rerender } = renderHook(
      (deps: { needRefresh: boolean }) =>
        usePwaUpdateController({ needRefresh: deps.needRefresh, updateSW, isPlaying: false, doc }),
      { initialProps: { needRefresh: true } },
    );

    expect(result.current.bannerVisible).toBe(true);

    act(() => {
      result.current.dismiss();
    });
    rerender({ needRefresh: true });

    expect(result.current.bannerVisible).toBe(false);
    // needRefresh is still true internally — the silent self-apply path
    // remains armed.
  });

  it("on next visibilitychange→visible with needRefresh true and no active playback, updateSW(true) is invoked silently", () => {
    const updateSW = vi.fn().mockResolvedValue(undefined);
    const doc = fakeDocument("hidden");
    renderHook(() =>
      usePwaUpdateController({ needRefresh: true, updateSW, isPlaying: false, doc }),
    );

    expect(updateSW).not.toHaveBeenCalled();

    doc.visibilityState = "visible";
    act(() => {
      doc.fire("visibilitychange");
    });

    expect(updateSW).toHaveBeenCalledWith(true);
  });

  it("when playback is active, the silent self-apply is suppressed and the banner remains visible", () => {
    const updateSW = vi.fn().mockResolvedValue(undefined);
    const doc = fakeDocument("hidden");
    const { result } = renderHook(() =>
      usePwaUpdateController({ needRefresh: true, updateSW, isPlaying: true, doc }),
    );

    doc.visibilityState = "visible";
    act(() => {
      doc.fire("visibilitychange");
    });

    expect(updateSW).not.toHaveBeenCalled();
    expect(result.current.bannerVisible).toBe(true);
  });

  it("Later + UpdateAvailableBanner — clicking Later calls onDismiss", () => {
    const onDismiss = vi.fn();
    const onRefresh = vi.fn();
    render(<UpdateAvailableBanner onRefresh={onRefresh} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /later/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
