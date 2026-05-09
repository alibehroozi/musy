import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IconButton } from "./IconButton.js";

describe("IconButton", () => {
  it("renders with the required aria-label", () => {
    render(
      <IconButton aria-label="Save">
        <span>♥</span>
      </IconButton>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("defaults to type='button'", () => {
    render(<IconButton aria-label="Save">x</IconButton>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(
      <IconButton aria-label="Save" onClick={onClick}>
        x
      </IconButton>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies the default variant by default", () => {
    render(<IconButton aria-label="Save">x</IconButton>);
    expect(screen.getByRole("button").className).toContain("text-text-muted");
  });

  it("applies the filled variant", () => {
    render(
      <IconButton aria-label="Save" variant="filled">
        x
      </IconButton>,
    );
    expect(screen.getByRole("button").className).toContain("bg-primary");
  });

  it("applies sm/md size classes (44×44 minimum touch target)", () => {
    const { rerender } = render(
      <IconButton aria-label="Save" size="sm">
        x
      </IconButton>,
    );
    expect(screen.getByRole("button").className).toContain("size-11");
    rerender(
      <IconButton aria-label="Save" size="md">
        x
      </IconButton>,
    );
    expect(screen.getByRole("button").className).toContain("size-12");
  });

  it("does not call onClick when disabled", () => {
    const onClick = vi.fn();
    render(
      <IconButton aria-label="Save" onClick={onClick} disabled>
        x
      </IconButton>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});
