import { usePlayerContext } from "./PlayerProvider.js";
import type { PlayerContextValue } from "./PlayerProvider.js";

/** Hook to access the global player state and controls. */
export function usePlayer(): PlayerContextValue {
  return usePlayerContext();
}
