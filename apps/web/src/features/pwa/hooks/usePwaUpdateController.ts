import { useEffect, useState } from "react";

export interface UsePwaUpdateControllerDeps {
  /** True once a new SW has installed and is waiting / has taken over. */
  needRefresh: boolean;
  /** The `updateServiceWorker` callback from `useRegisterSW`. */
  updateSW: (reloadPage: boolean) => Promise<void>;
  /**
   * Whether playback is currently active. The silent self-apply on
   * `visibilitychange → visible` is suppressed while this is true so we
   * never yank audio out from under a listening user.
   */
  isPlaying: boolean;
  /** Override for tests; defaults to global `document`. */
  doc?: {
    addEventListener: typeof document.addEventListener;
    removeEventListener: typeof document.removeEventListener;
    visibilityState: DocumentVisibilityState;
  };
}

export interface PwaUpdateControllerState {
  /**
   * Whether the user-facing "update available" banner should mount.
   * False when there's nothing to update, when the user dismissed the
   * banner this session, or when the silent self-apply has already
   * been triggered.
   */
  bannerVisible: boolean;
  /** Apply the update right now (reloads the page). */
  refreshNow: () => void;
  /** Hide the banner for this session, but keep listening for the next focus. */
  dismiss: () => void;
}

/**
 * The testable core of the SW-update UX (PWA-05).
 *
 * - When `needRefresh` flips true, the banner becomes visible.
 * - "Refresh" calls `updateSW(true)`, which `useRegisterSW` implements
 *   as skipWaiting + reload — the user lands on the new bundle.
 * - "Later" hides the banner for the rest of the session. The update
 *   is NOT discarded — we just stop nagging.
 * - On every `visibilitychange → visible` while `needRefresh` is still
 *   true AND playback is idle, the update silently applies. This is
 *   the "mobile PWA backgrounded → reopen → fresh build" path; the
 *   user never sees the banner, the bundle just gets newer.
 *
 * No `virtual:pwa-register/react` imports, no `usePlayer` — the deps
 * are injected so the hook is unit-testable with React Testing Library.
 */
export function usePwaUpdateController({
  needRefresh,
  updateSW,
  isPlaying,
  doc,
}: UsePwaUpdateControllerDeps): PwaUpdateControllerState {
  const [dismissed, setDismissed] = useState(false);
  const [applying, setApplying] = useState(false);

  // Reset the per-session dismissal if needRefresh goes back to false
  // (e.g. the SW reverted somehow). Idempotent — cheap to run.
  useEffect(() => {
    if (!needRefresh) {
      setDismissed(false);
      setApplying(false);
    }
  }, [needRefresh]);

  // Silent self-apply on next focus when conditions allow.
  useEffect(() => {
    if (!needRefresh) return undefined;
    const live =
      doc ??
      (typeof document !== "undefined"
        ? (document as unknown as NonNullable<UsePwaUpdateControllerDeps["doc"]>)
        : null);
    if (!live) return undefined;

    const onVisibilityChange = (): void => {
      if (live.visibilityState !== "visible") return;
      if (!needRefresh) return;
      if (isPlaying) return;
      setApplying(true);
      void updateSW(true).catch(() => {
        // If the reload-flagged update fails, the banner stays — user
        // can retry manually. We don't surface the error otherwise.
        setApplying(false);
      });
    };

    live.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      live.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [needRefresh, isPlaying, updateSW, doc]);

  const refreshNow = (): void => {
    setApplying(true);
    void updateSW(true).catch(() => {
      setApplying(false);
    });
  };

  const dismiss = (): void => {
    setDismissed(true);
  };

  const bannerVisible = needRefresh && !dismissed && !applying;

  return { bannerVisible, refreshNow, dismiss };
}
