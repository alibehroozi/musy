import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { SongSnapshot } from "@moc/contracts";

/**
 * App-wide context that lets `/explore` publish the top card snapshot
 * so `MiniPlayerHost` can hide the docked mini-player when the swipe-deck
 * card itself owns the player surface (UI-16).
 *
 * Two consumers are inevitable here (ExplorePage publishes, MiniPlayerHost
 * reads) and they live in disjoint subtrees of `App`, so context is the
 * smallest tool that fits.
 */
interface ExploreTopCardContextValue {
  topCard: SongSnapshot | null;
  setTopCard: (snapshot: SongSnapshot | null) => void;
}

const NOOP: ExploreTopCardContextValue = {
  topCard: null,
  setTopCard: () => {},
};

const ExploreTopCardContext = createContext<ExploreTopCardContextValue>(NOOP);

export function ExploreTopCardProvider({ children }: { children: ReactNode }): JSX.Element {
  const [topCard, setTopCard] = useState<SongSnapshot | null>(null);
  const value = useMemo(() => ({ topCard, setTopCard }), [topCard]);
  return <ExploreTopCardContext.Provider value={value}>{children}</ExploreTopCardContext.Provider>;
}

export function useExploreTopCard(): ExploreTopCardContextValue {
  return useContext(ExploreTopCardContext);
}
