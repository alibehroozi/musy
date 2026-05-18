// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PWA-06.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, render, screen, act, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
});
import { usePwaInstall } from "../../../apps/web/src/features/pwa/hooks/usePwaInstall.js";
import { InstallPromptBanner } from "../../../apps/web/src/features/pwa/components/InstallPromptBanner.js";
import { IosInstallHint } from "../../../apps/web/src/features/pwa/components/IosInstallHint.js";

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";
const IPHONE_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

interface FakeWindow {
  addEventListener: (type: string, handler: EventListener) => void;
  removeEventListener: (type: string, handler: EventListener) => void;
  fire: (type: string, event: Event) => void;
}

function fakeWindow(): FakeWindow {
  const handlers = new Map<string, Set<EventListener>>();
  return {
    addEventListener(type, handler) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)!.add(handler);
    },
    removeEventListener(type, handler) {
      handlers.get(type)?.delete(handler);
    },
    fire(type, event) {
      handlers.get(type)?.forEach((h) => h(event));
    },
  };
}

function fakeStorage(): Pick<Storage, "getItem" | "setItem"> & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
}

function fakeBipEvent(): Event & {
  prompt: ReturnType<typeof vi.fn>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
} {
  const event = new Event("beforeinstallprompt") as Event & {
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome: "accepted" });
  return event;
}

describe("PWA-06: install prompt capture + dismissal + iOS hint", () => {
  let preventSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    preventSpy?.mockRestore();
  });

  it("the controller listens for beforeinstallprompt, calls preventDefault, and stores the event", async () => {
    const win = fakeWindow();
    const storage = fakeStorage();

    const { result } = renderHook(() =>
      usePwaInstall({ userAgent: ANDROID_UA, isStandalone: false, storage, win }),
    );

    expect(result.current.kind).toBe("hidden");

    const event = fakeBipEvent();
    const preventDefault = vi.spyOn(event, "preventDefault");

    act(() => {
      win.fire("beforeinstallprompt", event);
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(result.current.kind).toBe("android-prompt");
  });

  it("InstallPromptBanner renders only when a captured event exists AND no dismissal is stored", () => {
    const win = fakeWindow();
    const storageWithDismiss = fakeStorage();
    storageWithDismiss.entries.set("musy:pwa-install-dismissed", "1");

    const { result } = renderHook(() =>
      usePwaInstall({
        userAgent: ANDROID_UA,
        isStandalone: false,
        storage: storageWithDismiss,
        win,
      }),
    );

    // Even though we'll fire the event, the previously-stored dismiss
    // means the affordance never shows.
    act(() => {
      win.fire("beforeinstallprompt", fakeBipEvent());
    });

    expect(result.current.kind).toBe("hidden");
  });

  it("clicking Install invokes the captured event's prompt() and hides the banner regardless of choice", async () => {
    const win = fakeWindow();
    const storage = fakeStorage();
    const event = fakeBipEvent();

    const { result } = renderHook(() =>
      usePwaInstall({ userAgent: ANDROID_UA, isStandalone: false, storage, win }),
    );
    act(() => {
      win.fire("beforeinstallprompt", event);
    });
    expect(result.current.kind).toBe("android-prompt");

    if (result.current.kind !== "android-prompt") throw new Error("unreachable");
    await act(async () => {
      await result.current.install();
    });

    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(result.current.kind).toBe("hidden");
    expect(storage.entries.get("musy:pwa-install-dismissed")).toBe("1");
  });

  it("clicking Later persists a dismissal in localStorage and hides the banner", () => {
    const win = fakeWindow();
    const storage = fakeStorage();
    const { result } = renderHook(() =>
      usePwaInstall({ userAgent: ANDROID_UA, isStandalone: false, storage, win }),
    );
    act(() => {
      win.fire("beforeinstallprompt", fakeBipEvent());
    });
    expect(result.current.kind).toBe("android-prompt");

    if (result.current.kind !== "android-prompt") throw new Error("unreachable");
    act(() => {
      result.current.dismiss();
    });

    expect(result.current.kind).toBe("hidden");
    expect(storage.entries.get("musy:pwa-install-dismissed")).toBe("1");
  });

  it("when isStandalone is true, neither banner nor iOS hint renders, and no listener is attached", () => {
    const win = fakeWindow();
    const storage = fakeStorage();
    const addSpy = vi.spyOn(win, "addEventListener");

    const { result } = renderHook(() =>
      usePwaInstall({ userAgent: ANDROID_UA, isStandalone: true, storage, win }),
    );

    expect(result.current.kind).toBe("hidden");
    expect(addSpy).not.toHaveBeenCalled();

    const { result: iosResult } = renderHook(() =>
      usePwaInstall({ userAgent: IPHONE_SAFARI_UA, isStandalone: true, storage, win }),
    );
    expect(iosResult.current.kind).toBe("hidden");
  });

  it("on iOS Safari (no beforeinstallprompt), IosInstallHint renders until dismissed", () => {
    const win = fakeWindow();
    const storage = fakeStorage();
    const { result, rerender } = renderHook(() =>
      usePwaInstall({ userAgent: IPHONE_SAFARI_UA, isStandalone: false, storage, win }),
    );

    expect(result.current.kind).toBe("ios-hint");

    // Render the actual component for the share-sheet wording check.
    if (result.current.kind !== "ios-hint") throw new Error("unreachable");
    const dismiss = result.current.dismiss;
    const { unmount } = render(<IosInstallHint onDismiss={dismiss} />);
    expect(screen.getByText(/share/i)).toBeInTheDocument();
    expect(screen.getByText(/add to home screen/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /got it/i }));
    unmount();

    rerender();
    expect(result.current.kind).toBe("hidden");
    expect(storage.entries.get("musy:pwa-ios-hint-dismissed")).toBe("1");
  });

  it("InstallPromptBanner click handlers wire through to props", () => {
    const onInstall = vi.fn();
    const onDismiss = vi.fn();
    render(<InstallPromptBanner onInstall={onInstall} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /install/i }));
    expect(onInstall).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
