import { Icon, type IconName } from "../Icon/Icon.js";
import { Typography } from "../Typography/Typography.js";

export interface BottomNavTab {
  id: string;
  label: string;
  icon: IconName;
  href: string;
}

export interface BottomNavProps {
  tabs: BottomNavTab[];
  activePath: string;
  onNavigate: (href: string) => void;
}

export function BottomNav({ tabs, activePath, onNavigate }: BottomNavProps): JSX.Element {
  return (
    <nav
      aria-label="Main navigation"
      className="bg-surface border-t border-border"
      style={{ paddingBottom: "min(env(safe-area-inset-bottom, 0px), 12px)" }}
    >
      <div className="flex h-16">
        {tabs.map((tab) => {
          const isActive = activePath === tab.href || activePath.startsWith(tab.href + "/");
          return (
            <a
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={[
                "flex flex-col items-center justify-center flex-1 gap-1 transition-colors duration-200",
                isActive ? "text-text" : "text-text-muted",
              ].join(" ")}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(tab.href);
              }}
            >
              <Icon name={tab.icon} size={24} />
              <Typography variant="caption">{tab.label}</Typography>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
