import { useNavigate, useLocation } from "react-router-dom";
import { BottomNav, type BottomNavTab } from "@moc/design-system";
import { AppRoutes } from "./routes.js";
import { PlayerProvider } from "./features/player/PlayerProvider.js";
import { MiniPlayerHost } from "./features/player/MiniPlayerHost.js";
import { NowPlayingOverlay } from "./features/player/NowPlayingOverlay.js";
import { ExploreTopCardProvider } from "./features/explore/ExploreTopCardContext.js";
import { ExploreMediaBridge } from "./features/explore/ExploreMediaBridge.js";
import { PwaController } from "./features/pwa/PwaController.js";

const NAV_TABS: BottomNavTab[] = [
  { id: "explore", label: "Explore", icon: "compass", href: "/explore" },
  { id: "taste", label: "Taste", icon: "heart", href: "/taste" },
  { id: "search", label: "Search", icon: "search", href: "/search" },
];

// PlayerProvider wraps ExploreTopCardProvider so ExploreMediaBridge (UI-40)
// can consume both contexts. The two providers are otherwise independent.
export function App(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <PlayerProvider>
      <ExploreTopCardProvider>
        {/* BROWSER-09 — iOS PWA standalone with viewport-fit=cover lets the
            OS clock / notch overlay web content. paddingTop reserves space
            below the status bar; left/right cover landscape notches. No
            bottom inset on the wrapper — BottomNav owns env(safe-area-
            inset-bottom) so the nav stays stuck to the viewport bottom. */}
        <div
          data-testid="app-shell"
          className="fixed inset-0 flex flex-col overflow-hidden"
          style={{
            paddingTop: "env(safe-area-inset-top)",
            paddingLeft: "env(safe-area-inset-left)",
            paddingRight: "env(safe-area-inset-right)",
          }}
        >
          <div className="flex-1 overflow-y-auto">
            <AppRoutes />
          </div>
          <MiniPlayerHost />
          <BottomNav tabs={NAV_TABS} activePath={location.pathname} onNavigate={navigate} />
        </div>
        <NowPlayingOverlay />
        <ExploreMediaBridge />
        <PwaController />
      </ExploreTopCardProvider>
    </PlayerProvider>
  );
}
