import { useEffect } from "react";

export interface UseServiceWorkerUpdatesOptions {
  /**
   * Live registration handle. `null` when the SW hasn't registered yet —
   * the hook is a no-op in that state. Once a registration is provided,
   * the hook calls `.update()` once on mount, every `intervalMs`, and on
   * every `visibilitychange` transition to `visible`.
   */
  registration: ServiceWorkerRegistration | null;
  /**
   * Periodic cadence. Default 30 min — matches PWA-04's lower bound.
   * Most mobile PWAs sit backgrounded for hours; the visibility-change
   * hook covers the "user opened the app after a while" case; this
   * timer covers "user kept the app open for ages."
   */
  intervalMs?: number;
  /**
   * Optional override for the document the listener attaches to. The
   * default uses the global `document`; tests inject a fake to avoid
   * jsdom's quirky visibility-change handling.
   */
  doc?: {
    addEventListener: typeof document.addEventListener;
    removeEventListener: typeof document.removeEventListener;
    visibilityState: DocumentVisibilityState;
  };
}

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Schedules `registration.update()` calls on three triggers — mount,
 * periodic interval, and visibility-change → visible. Tears all three
 * down on unmount.
 *
 * PWA-04. Pure-ish: no module-scope window/document access, all reads
 * funnel through the injected `doc` (defaulting to the global). Tests
 * pass a fake document and a stub registration to verify the call
 * pattern without spinning up a real service worker.
 */
export function useServiceWorkerUpdates(opts: UseServiceWorkerUpdatesOptions): void {
  const { registration, intervalMs = DEFAULT_INTERVAL_MS } = opts;

  useEffect(() => {
    if (!registration) return undefined;

    const doc =
      opts.doc ??
      (typeof document !== "undefined"
        ? (document as unknown as NonNullable<UseServiceWorkerUpdatesOptions["doc"]>)
        : null);

    // (1) one-shot check on mount
    void registration.update().catch(() => {
      // Swallow — failure here just means we'll retry on the next
      // trigger. We don't have a UI surface for it and the SW itself
      // will keep serving the previous bundle.
    });

    // (2) periodic check
    const timerId = setInterval(() => {
      void registration.update().catch(() => undefined);
    }, intervalMs);

    // (3) visibility-change check
    let cleanupVisibility: (() => void) | undefined;
    if (doc) {
      const onVisibilityChange = (): void => {
        if (doc.visibilityState === "visible") {
          void registration.update().catch(() => undefined);
        }
      };
      doc.addEventListener("visibilitychange", onVisibilityChange);
      cleanupVisibility = (): void => {
        doc.removeEventListener("visibilitychange", onVisibilityChange);
      };
    }

    return () => {
      clearInterval(timerId);
      cleanupVisibility?.();
    };
  }, [registration, intervalMs, opts.doc]);
}
