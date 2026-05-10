// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ProgressSlider } from "./ProgressSlider.js";

function setRectWidth(el: HTMLElement, width: number): void {
  el.getBoundingClientRect = (): DOMRect => ({
    x: 0,
    y: 0,
    width,
    height: 12,
    top: 0,
    left: 0,
    right: width,
    bottom: 12,
    toJSON: () => ({}),
  });
  Object.defineProperty(el, "setPointerCapture", {
    value: vi.fn(),
    configurable: true,
    writable: true,
  });
  Object.defineProperty(el, "releasePointerCapture", {
    value: vi.fn(),
    configurable: true,
    writable: true,
  });
}

// jsdom doesn't construct PointerEvent properly (clientX is dropped from
// the init dict). Build a MouseEvent with the correct type — React routes
// onPointerDown/Move/Up by event.type, so the synthetic handlers still fire.
function dispatchPointerEvent(el: HTMLElement, type: string, clientX: number): void {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "clientX", { value: clientX });
  Object.defineProperty(ev, "pointerId", { value: 1 });
  el.dispatchEvent(ev);
}

describe("ProgressSlider — rendering", () => {
  it("renders role='slider' with the provided aria-label", () => {
    render(<ProgressSlider valueFraction={0.5} ariaLabel="Playback position" />);
    const slider = screen.getByRole("slider", { name: "Playback position" });
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveAttribute("aria-valuenow", "50");
  });

  it("clamps an out-of-range valueFraction to [0, 100] in aria-valuenow", () => {
    render(<ProgressSlider valueFraction={2} ariaLabel="Position" />);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "100");
  });

  it("treats NaN/Infinity as 0", () => {
    render(<ProgressSlider valueFraction={Number.NaN} ariaLabel="Position" />);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "0");
  });
});

describe("ProgressSlider — drag-to-scrub", () => {
  it("fires onScrub on pointerdown with the position fraction", () => {
    const onScrub = vi.fn();
    render(<ProgressSlider valueFraction={0} ariaLabel="Position" onScrub={onScrub} />);
    const slider = screen.getByRole("slider");
    setRectWidth(slider, 200);
    dispatchPointerEvent(slider, "pointerdown", 100);
    expect(onScrub).toHaveBeenCalledWith(0.5);
  });

  it("fires onScrub on pointermove ONLY while dragging (after pointerdown)", () => {
    const onScrub = vi.fn();
    render(<ProgressSlider valueFraction={0} ariaLabel="Position" onScrub={onScrub} />);
    const slider = screen.getByRole("slider");
    setRectWidth(slider, 200);

    dispatchPointerEvent(slider, "pointermove", 50);
    expect(onScrub).not.toHaveBeenCalled();

    dispatchPointerEvent(slider, "pointerdown", 50);
    dispatchPointerEvent(slider, "pointermove", 150);
    expect(onScrub).toHaveBeenLastCalledWith(0.75);
  });

  it("commits onScrubEnd EXACTLY ONCE on pointerup (commit-on-release)", () => {
    const onScrub = vi.fn();
    const onScrubEnd = vi.fn();
    render(
      <ProgressSlider
        valueFraction={0}
        ariaLabel="Position"
        onScrub={onScrub}
        onScrubEnd={onScrubEnd}
      />,
    );
    const slider = screen.getByRole("slider");
    setRectWidth(slider, 200);

    dispatchPointerEvent(slider, "pointerdown", 50);
    dispatchPointerEvent(slider, "pointermove", 100);
    dispatchPointerEvent(slider, "pointermove", 150);
    expect(onScrubEnd).not.toHaveBeenCalled();

    dispatchPointerEvent(slider, "pointerup", 150);
    expect(onScrubEnd).toHaveBeenCalledTimes(1);
    expect(onScrubEnd).toHaveBeenCalledWith(0.75);

    dispatchPointerEvent(slider, "pointerup", 100);
    expect(onScrubEnd).toHaveBeenCalledTimes(1);
  });

  it("clamps the committed fraction to [0, 1] when pointer leaves the track bounds", () => {
    const onScrubEnd = vi.fn();
    render(<ProgressSlider valueFraction={0} ariaLabel="Position" onScrubEnd={onScrubEnd} />);
    const slider = screen.getByRole("slider");
    setRectWidth(slider, 200);

    dispatchPointerEvent(slider, "pointerdown", 100);
    dispatchPointerEvent(slider, "pointerup", 1000);
    expect(onScrubEnd).toHaveBeenCalledWith(1);
  });

  it("pointercancel commits like pointerup so a drag never gets stranded", () => {
    const onScrubEnd = vi.fn();
    render(<ProgressSlider valueFraction={0} ariaLabel="Position" onScrubEnd={onScrubEnd} />);
    const slider = screen.getByRole("slider");
    setRectWidth(slider, 200);

    dispatchPointerEvent(slider, "pointerdown", 100);
    dispatchPointerEvent(slider, "pointercancel", 100);
    expect(onScrubEnd).toHaveBeenCalledTimes(1);
  });
});
