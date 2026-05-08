// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { IconButton } from "./IconButton.js";

describe("IconButton", () => {
  it("renders a button with the accessible label", () => {
    render(
      <IconButton label="Add to saved">
        <span>+</span>
      </IconButton>,
    );
    expect(screen.getByRole("button", { name: "Add to saved" })).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(
      <IconButton label="Save" onClick={onClick}>
        <span>+</span>
      </IconButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("applies filled variant classes when variant=filled", () => {
    render(
      <IconButton label="Saved" variant="filled">
        <span>+</span>
      </IconButton>,
    );
    const btn = screen.getByRole("button", { name: "Saved" });
    expect(btn.className).toContain("bg-primary");
  });

  it("applies default variant classes when variant=default", () => {
    render(
      <IconButton label="Save" variant="default">
        <span>+</span>
      </IconButton>,
    );
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn.className).toContain("bg-transparent");
  });

  it("applies sm size class", () => {
    render(
      <IconButton label="Save" size="sm">
        <span>+</span>
      </IconButton>,
    );
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn.className).toContain("size-11");
  });

  it("is disabled when disabled prop is passed", () => {
    render(
      <IconButton label="Save" disabled>
        <span>+</span>
      </IconButton>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
