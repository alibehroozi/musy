import { useCallback, useEffect, useState } from "react";
import { detectPwaPlatform, type PwaPlatform } from "@moc/web-core";

const ANDROID_DISMISS_KEY = "musy:pwa-install-dismissed";
const IOS_DISMISS_KEY = "musy:pwa-ios-hint-dismissed";

/**
 * Minimal shape of `BeforeInstallPromptEvent`. The real event extends
 * `Event` and adds `prompt()` + `userChoice`; we only use those two,
 * so we don't need the full DOM lib type (which not every Lib target
 * exposes).
 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface UsePwaInstallDeps {
  /** `navigator.userAgent`. Override for tests. */
  userAgent: string;
  /** Whether the app already runs in standalone mode. Override for tests. */
  isStandalone: boolean;
  /** Storage backend for the dismiss flag. Override for tests. */
  storage?: Pick<Storage, "getItem" | "setItem">;
  /** Override for the window the listener attaches to. Default global. */
  win?: {
    addEventListener: typeof window.addEventListener;
    removeEventListener: typeof window.removeEventListener;
  };
}

export type PwaInstallState =
  | { kind: "hidden" }
  | { kind: "android-prompt"; install: () => Promise<void>; dismiss: () => void }
  | { kind: "ios-hint"; dismiss: () => void };

/**
 * Owns the install-affordance state machine (PWA-06).
 *
 * - On Android / desktop Chromium: listens for `beforeinstallprompt`,
 *   `preventDefault()`s it so the browser's native chrome doesn't appear,
 *   stashes the event, and exposes an `install()` callback that calls
 *   the event's `prompt()`.
 * - On iOS Safari: surfaces an `ios-hint` state instead — the user has
 *   to "Share → Add to Home Screen" themselves; we just walk them
 *   through it.
 * - Either way, dismissal persists in `localStorage` so we don't
 *   pester the user on every page load.
 * - When already installed (`isStandalone === true`), state is `hidden`
 *   and no listener attaches.
 */
export function usePwaInstall(deps: UsePwaInstallDeps): PwaInstallState {
  const { userAgent, isStandalone, storage, win } = deps;
  const platform: PwaPlatform = detectPwaPlatform({ userAgent, isStandalone });

  const [bipEvent, setBipEvent] = useState<InstallPromptEvent | null>(null);

  const [androidDismissed, setAndroidDismissed] = useState<boolean>(() =>
    readDismiss(storage, ANDROID_DISMISS_KEY),
  );
  const [iosDismissed, setIosDismissed] = useState<boolean>(() =>
    readDismiss(storage, IOS_DISMISS_KEY),
  );

  // Capture `beforeinstallprompt` on Android / desktop installable
  // platforms. Skip when the app is already installed or the platform
  // doesn't fire the event (iOS, unknown).
  useEffect(() => {
    if (platform !== "android-installable" && platform !== "desktop-installable") return undefined;
    const target =
      win ??
      (typeof window !== "undefined"
        ? (window as unknown as NonNullable<UsePwaInstallDeps["win"]>)
        : null);
    if (!target) return undefined;

    const handler = (event: Event): void => {
      event.preventDefault();
      setBipEvent(event as InstallPromptEvent);
    };
    target.addEventListener("beforeinstallprompt", handler as EventListener);
    return () => {
      target.removeEventListener("beforeinstallprompt", handler as EventListener);
    };
  }, [platform, win]);

  const installAndroid = useCallback(async (): Promise<void> => {
    if (!bipEvent) return;
    try {
      await bipEvent.prompt();
      await bipEvent.userChoice;
    } finally {
      // The browser only fires one BeforeInstallPromptEvent per session
      // — regardless of the user's choice, the event is now consumed
      // and the affordance hides. If they declined we record a dismiss
      // so it doesn't re-appear on a re-prompt the browser might fire
      // on the next visit.
      setBipEvent(null);
      writeDismiss(storage, ANDROID_DISMISS_KEY);
      setAndroidDismissed(true);
    }
  }, [bipEvent, storage]);

  const dismissAndroid = useCallback((): void => {
    writeDismiss(storage, ANDROID_DISMISS_KEY);
    setAndroidDismissed(true);
  }, [storage]);

  const dismissIos = useCallback((): void => {
    writeDismiss(storage, IOS_DISMISS_KEY);
    setIosDismissed(true);
  }, [storage]);

  if (platform === "installed" || platform === "ios-other-browser" || platform === "unknown") {
    return { kind: "hidden" };
  }

  if (platform === "ios-safari") {
    if (iosDismissed) return { kind: "hidden" };
    return { kind: "ios-hint", dismiss: dismissIos };
  }

  // android-installable | desktop-installable
  if (androidDismissed || !bipEvent) return { kind: "hidden" };
  return { kind: "android-prompt", install: installAndroid, dismiss: dismissAndroid };
}

function readDismiss(storage: UsePwaInstallDeps["storage"], key: string): boolean {
  try {
    const live = storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
    return live?.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeDismiss(storage: UsePwaInstallDeps["storage"], key: string): void {
  try {
    const live = storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
    live?.setItem(key, "1");
  } catch {
    // Storage may be unavailable (private mode, quota). The session-
    // state setter still hides the affordance for the current page.
  }
}
