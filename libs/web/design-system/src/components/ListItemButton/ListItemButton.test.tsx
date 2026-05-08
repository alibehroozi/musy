import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ListItemButton } from "./ListItemButton.js";

describe("ListItemButton", () => {
  it("renders children", () => {
    render(<ListItemButton>Recent search</ListItemButton>);
    expect(screen.getByRole("button", { name: "Recent search" })).toBeInTheDocument();
  });

  it("defaults to type='button' to avoid accidental form submits", () => {
    render(<ListItemButton>row</ListItemButton>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("respects an explicit type prop", () => {
    render(<ListItemButton type="submit">row</ListItemButton>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<ListItemButton onClick={onClick}>row</ListItemButton>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", () => {
    const onClick = vi.fn();
    render(
      <ListItemButton onClick={onClick} disabled>
        row
      </ListItemButton>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders leading content when provided", () => {
    render(<ListItemButton leading={<span data-testid="lead">L</span>}>row</ListItemButton>);
    expect(screen.getByTestId("lead")).toBeInTheDocument();
  });

  it("renders trailing content when provided", () => {
    render(<ListItemButton trailing={<span data-testid="trail">2h</span>}>row</ListItemButton>);
    expect(screen.getByTestId("trail")).toBeInTheDocument();
  });

  it("applies row layout classes (full-width, left-aligned, flex)", () => {
    render(<ListItemButton>row</ListItemButton>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("w-full");
    expect(cls).toContain("text-left");
    expect(cls).toContain("flex");
    expect(cls).toContain("items-center");
  });

  it("applies a hover surface state", () => {
    render(<ListItemButton>row</ListItemButton>);
    expect(screen.getByRole("button").className).toContain("hover:bg-surface/50");
  });

  it("appends a custom className without dropping the base classes", () => {
    render(<ListItemButton className="custom">row</ListItemButton>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("custom");
    expect(cls).toContain("w-full");
  });

  it("forwards arbitrary button attributes (e.g. aria-label, data-testid)", () => {
    render(
      <ListItemButton aria-label="Pick recent" data-testid="row">
        row
      </ListItemButton>,
    );
    const btn = screen.getByTestId("row");
    expect(btn).toHaveAttribute("aria-label", "Pick recent");
  });
});
