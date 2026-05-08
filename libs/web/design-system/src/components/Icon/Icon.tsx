import { Clock, Compass, Heart, Search } from "lucide-react";

const LUCIDE_ICONS = {
  clock: Clock,
  compass: Compass,
  heart: Heart,
  search: Search,
} as const;

type LucideIconName = keyof typeof LUCIDE_ICONS;

// Brand marks live in the DS so apps don't host trademarked SVGs ad-hoc.
// Hard-coded brand colors are the one sanctioned exception to tokens-only
// — trademarks can't be re-themed.
const BRAND_ICONS = {
  "google-brand": GoogleBrandSvg,
} as const;

type BrandIconName = keyof typeof BRAND_ICONS;

export type IconName = LucideIconName | BrandIconName;

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 24, className }: IconProps): JSX.Element {
  if (name in BRAND_ICONS) {
    const Brand = BRAND_ICONS[name as BrandIconName];
    return <Brand size={size} className={className} />;
  }
  const LucideIcon = LUCIDE_ICONS[name as LucideIconName];
  return <LucideIcon size={size} className={className} aria-hidden />;
}

interface BrandSvgProps {
  size: number;
  className?: string;
}

function GoogleBrandSvg({ size, className }: BrandSvgProps): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      aria-hidden
      focusable="false"
    >
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.5 29.6 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.3-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.5 29.6 4.5 24 4.5 16.4 4.5 9.8 8.7 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 43.5c5.5 0 10.4-2 14.1-5.4l-6.5-5.5c-2 1.5-4.6 2.4-7.6 2.4-5.3 0-9.7-3.3-11.3-8l-6.6 5C9.6 39 16.2 43.5 24 43.5z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.6l6.5 5.5C42 35.5 43.5 30.1 43.5 24c0-1.2-.1-2.3-.3-3.5z"
      />
    </svg>
  );
}
