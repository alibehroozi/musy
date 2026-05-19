import { useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { usePlayer } from "../../player/usePlayer.js";
import { useServiceWorkerUpdates } from "./useServiceWorkerUpdates.js";
import { usePwaUpdateController, type PwaUpdateControllerState } from "./usePwaUpdateController.js";

/**
 * App-side wiring for the PWA update UX. Pulls `needRefresh` +
 * `updateServiceWorker` from `useRegisterSW`, asks the player for
 * playback state, then defers all the actual state-machine work to
 * `usePwaUpdateController` (which is unit-tested without the virtual:
 * import). The polling cadence (PWA-04) is handled by
 * `useServiceWorkerUpdates` against the live registration.
 *
 * Consumers (the `PwaController` component) read `bannerVisible` +
 * `refreshNow` + `dismiss` and render the banner accordingly.
 */
export function usePwaUpdate(): PwaUpdateControllerState {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, reg) {
      if (reg) setRegistration(reg);
    },
  });

  useServiceWorkerUpdates({ registration });

  const player = usePlayer();
  const isPlaying =
    player.engineState.status === "playing" || player.engineState.status === "loading";

  return usePwaUpdateController({
    needRefresh,
    updateSW: updateServiceWorker,
    isPlaying,
  });
}
