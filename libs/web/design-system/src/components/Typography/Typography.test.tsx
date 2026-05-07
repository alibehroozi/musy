import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Typography } from "./Typography.js";

describe("Typography", () => {
  it("renders an <h1> for variant=h1", () => {
    render(<Typography variant="h1">Title</Typography>);
    const el = screen.getByText("Title");
    expect(el.tagName).toBe("H1");
  });

  it("renders an <h2> for variant=h2", () => {
    render(<Typography variant="h2">Section</Typography>);
    expect(screen.getByText("Section").tagName).toBe("H2");
  });

  it("renders an <h3> for variant=h3", () => {
    render(<Typography variant="h3">Subsection</Typography>);
    expect(screen.getByText("Subsection").tagName).toBe("H3");
  });

  it("renders a <p> for variant=body (default)", () => {
    render(<Typography>Hello</Typography>);
    expect(screen.getByText("Hello").tagName).toBe("P");
  });

  it("renders a <span> for variant=caption", () => {
    render(<Typography variant="caption">note</Typography>);
    expect(screen.getByText("note").tagName).toBe("SPAN");
  });

  it("appends a custom className without dropping the variant classes", () => {
    render(
      <Typography variant="h1" className="custom-class">
        Title
      </Typography>,
    );
    const el = screen.getByText("Title");
    expect(el.className).toContain("custom-class");
    expect(el.className).toContain("text-3xl");
  });
});
