import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Icon } from "./Icon.js";

describe("Icon", () => {
  it("renders an svg for each supported icon name", () => {
    const names = ["clock", "compass", "heart", "search", "thumbs-down", "google-brand"] as const;
    for (const name of names) {
      const { container } = render(<Icon name={name} />);
      expect(container.querySelector("svg")).not.toBeNull();
      container.remove();
    }
  });

  it("hides the svg from assistive technology via aria-hidden", () => {
    const { container } = render(<Icon name="search" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden");
  });

  it("hides brand-mark svgs from assistive technology via aria-hidden", () => {
    const { container } = render(<Icon name="google-brand" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden");
  });

  it("passes the size prop to the underlying lucide icon", () => {
    const { container } = render(<Icon name="search" size={32} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("width", "32");
    expect(svg).toHaveAttribute("height", "32");
  });

  it("passes the size prop to brand-mark svgs", () => {
    const { container } = render(<Icon name="google-brand" size={20} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("width", "20");
    expect(svg).toHaveAttribute("height", "20");
  });

  it("applies a custom className to the svg", () => {
    const { container } = render(<Icon name="search" className="my-class" />);
    expect(container.querySelector("svg")).toHaveClass("my-class");
  });

  it("applies a custom className to brand-mark svgs", () => {
    const { container } = render(<Icon name="google-brand" className="my-class" />);
    expect(container.querySelector("svg")).toHaveClass("my-class");
  });
});
