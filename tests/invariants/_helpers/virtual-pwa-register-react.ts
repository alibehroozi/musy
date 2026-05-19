/**
 * Vitest stub for `virtual:pwa-register/react`.
 *
 * vite-plugin-pwa exposes `useRegisterSW` through a virtual module
 * that only resolves inside Vite — under vitest's resolver, the
 * import is unresolvable and any test transitively pulling
 * `apps/web/src/features/pwa/hooks/usePwaUpdate.ts` (e.g. anything
 * that touches `App.tsx`) crashes at load. This stub gives the
 * resolver something real to return:
 *
 *   `useRegisterSW({ onRegisteredSW? })` returns the same shape as
 *   the real hook — `needRefresh` + `offlineReady` tuples and an
 *   `updateServiceWorker(reload?)` callback — but does nothing.
 *
 * Wired in via `vitest.config.ts` aliases. Tests that explicitly
 * exercise the update-controller behavior go through
 * `usePwaUpdateController` (no virtual import) so they never hit
 * this file; this is purely the "compiles" shim.
 */
import { useState } from "react";

export function useRegisterSW(_options?: {
  onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegisterError?: (error: unknown) => void;
}): {
  needRefresh: [boolean, (value: boolean) => void];
  offlineReady: [boolean, (value: boolean) => void];
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
} {
  const needRefresh = useState(false);
  const offlineReady = useState(false);
  return {
    needRefresh,
    offlineReady,
    updateServiceWorker: async (): Promise<void> => undefined,
  };
}
