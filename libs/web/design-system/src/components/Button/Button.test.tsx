import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "./Button.js";

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("defaults to type='button' to avoid accidental form submits", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("respects an explicit type prop", () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Tap</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Tap
      </Button>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("applies primary variant classes by default", () => {
    render(<Button>Default</Button>);
    expect(screen.getByRole("button").className).toContain("bg-primary");
  });

  it("applies secondary variant classes", () => {
    render(<Button variant="secondary">x</Button>);
    expect(screen.getByRole("button").className).toContain("bg-surface");
  });

  it("applies ghost variant classes", () => {
    render(<Button variant="ghost">x</Button>);
    expect(screen.getByRole("button").className).toContain("bg-transparent");
  });

  it("applies size classes (sm)", () => {
    render(<Button size="sm">x</Button>);
    expect(screen.getByRole("button").className).toContain("text-sm");
  });

  it("applies size classes (lg)", () => {
    render(<Button size="lg">x</Button>);
    expect(screen.getByRole("button").className).toContain("text-lg");
  });

  it("appends a custom className without dropping the variant classes", () => {
    render(<Button className="custom">x</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("custom");
    expect(cls).toContain("bg-primary");
  });
});
