import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "./Card.js";

describe("Card", () => {
  it("renders children", () => {
    render(
      <Card>
        <span>hello</span>
      </Card>,
    );
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("applies token-driven surface classes by default", () => {
    const { container } = render(<Card>content</Card>);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("bg-surface");
    expect(root.className).toContain("border-border");
    expect(root.className).toContain("rounded-lg");
    expect(root.className).toContain("shadow-lg");
  });

  it("merges a caller-provided className without losing defaults", () => {
    const { container } = render(<Card className="custom-class">content</Card>);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("custom-class");
    expect(root.className).toContain("bg-surface");
  });

  it("renders an overlay slot above the children when provided", () => {
    render(
      <Card overlay={<span>onboarding</span>}>
        <span>artwork</span>
      </Card>,
    );
    const overlay = screen.getByText("onboarding");
    expect(overlay).toBeInTheDocument();
    expect(screen.getByText("artwork")).toBeInTheDocument();
    // overlay is wrapped in an absolutely-positioned layer
    const wrapper = overlay.parentElement as HTMLElement;
    expect(wrapper.className).toContain("absolute");
  });

  it("omits the overlay layer entirely when no overlay prop is passed", () => {
    const { container } = render(<Card>content</Card>);
    expect(container.querySelector(".absolute")).toBeNull();
  });
});
