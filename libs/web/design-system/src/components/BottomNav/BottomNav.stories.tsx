import type { Story } from "@ladle/react";
import { BottomNav, type BottomNavTab } from "./BottomNav.js";

const TABS: BottomNavTab[] = [
  { id: "explore", label: "Explore", icon: "compass", href: "/explore" },
  { id: "taste", label: "Taste", icon: "heart", href: "/taste" },
  { id: "search", label: "Search", icon: "search", href: "/search" },
];

export const ExploreActive: Story = () => (
  <BottomNav tabs={TABS} activePath="/explore" onNavigate={() => {}} />
);

export const TasteActive: Story = () => (
  <BottomNav tabs={TABS} activePath="/taste" onNavigate={() => {}} />
);

export const SearchActive: Story = () => (
  <BottomNav tabs={TABS} activePath="/search" onNavigate={() => {}} />
);
