import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BottomNav, type BottomNavTab } from "./BottomNav.js";

const TABS: BottomNavTab[] = [
  { id: "explore", label: "Explore", icon: "compass", href: "/explore" },
  { id: "taste", label: "Taste", icon: "heart", href: "/taste" },
  { id: "search", label: "Search", icon: "search", href: "/search" },
];

describe("BottomNav", () => {
  it("renders a nav element with the accessible name 'Main navigation'", () => {
    render(<BottomNav tabs={TABS} activePath="/search" onNavigate={vi.fn()} />);
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
  });

  it("renders all tab labels", () => {
    render(<BottomNav tabs={TABS} activePath="/search" onNavigate={vi.fn()} />);
    expect(screen.getByText("Explore")).toBeInTheDocument();
    expect(screen.getByText("Taste")).toBeInTheDocument();
    expect(screen.getByText("Search")).toBeInTheDocument();
  });

  it("marks the active tab with aria-current='page'", () => {
    render(<BottomNav tabs={TABS} activePath="/taste" onNavigate={vi.fn()} />);
    const links = screen.getAllByRole("link");
    const active = links.filter((l) => l.getAttribute("aria-current") === "page");
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveTextContent("Taste");
  });

  it("does not mark inactive tabs with aria-current", () => {
    render(<BottomNav tabs={TABS} activePath="/search" onNavigate={vi.fn()} />);
    const links = screen.getAllByRole("link");
    const inactive = links.filter((l) => l.getAttribute("href") !== "/search");
    for (const link of inactive) {
      expect(link).not.toHaveAttribute("aria-current");
    }
  });

  it("calls onNavigate with the href when a tab is clicked", () => {
    const onNavigate = vi.fn();
    render(<BottomNav tabs={TABS} activePath="/search" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText("Explore"));
    expect(onNavigate).toHaveBeenCalledWith("/explore");
  });

  it("treats a sub-path as active for the matching tab", () => {
    render(<BottomNav tabs={TABS} activePath="/explore/albums" onNavigate={vi.fn()} />);
    const links = screen.getAllByRole("link");
    const active = links.filter((l) => l.getAttribute("aria-current") === "page");
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveTextContent("Explore");
  });
});
