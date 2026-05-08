// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ProgressSlider } from "./ProgressSlider.js";

describe("ProgressSlider", () => {
  it("renders with role=slider and aria attributes", () => {
    const { getByRole } = render(
      <ProgressSlider
        valueFraction={0.5}
        onScrub={vi.fn()}
        onScrubEnd={vi.fn()}
        ariaLabel="Playback progress"
      />,
    );
    const slider = getByRole("slider");
    expect(slider).toHaveAttribute("aria-valuenow", "50");
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "100");
    expect(slider).toHaveAttribute("aria-label", "Playback progress");
  });
});
