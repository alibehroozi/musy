import { useNavigate, useLocation } from "react-router-dom";
import { BottomNav, type BottomNavTab } from "@moc/design-system";
import { AppRoutes } from "./routes.js";

const NAV_TABS: BottomNavTab[] = [
  { id: "explore", label: "Explore", icon: "compass", href: "/explore" },
  { id: "taste", label: "Taste", icon: "heart", href: "/taste" },
  { id: "search", label: "Search", icon: "search", href: "/search" },
];

export function App(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 pb-16">
        <AppRoutes />
      </div>
      <BottomNav tabs={NAV_TABS} activePath={location.pathname} onNavigate={navigate} />
    </div>
  );
}
