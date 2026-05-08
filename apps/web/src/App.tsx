import { useNavigate, useLocation } from "react-router-dom";
import { BottomNav, type BottomNavTab } from "@moc/design-system";
import { AppRoutes } from "./routes.js";
import { PlayerProvider } from "./features/player/PlayerProvider.js";
import { MiniPlayerHost } from "./features/player/MiniPlayerHost.js";

const NAV_TABS: BottomNavTab[] = [
  { id: "explore", label: "Explore", icon: "compass", href: "/explore" },
  { id: "taste", label: "Taste", icon: "heart", href: "/taste" },
  { id: "search", label: "Search", icon: "search", href: "/search" },
];

function AppShell(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <AppRoutes />
      </div>
      <MiniPlayerHost />
      <BottomNav tabs={NAV_TABS} activePath={location.pathname} onNavigate={navigate} />
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <PlayerProvider>
      <AppShell />
    </PlayerProvider>
  );
}
