import { Compass, Heart, Search } from "lucide-react";

const ICON_MAP = {
  compass: Compass,
  heart: Heart,
  search: Search,
} as const;

export type IconName = keyof typeof ICON_MAP;

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 24, className }: IconProps): JSX.Element {
  const LucideIcon = ICON_MAP[name];
  return <LucideIcon size={size} className={className} aria-hidden />;
}
