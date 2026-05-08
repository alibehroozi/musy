// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-08.

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ProgressSlider } from "@moc/design-system";

describe("LOGIC-08: ProgressSlider fires onScrub during drag and onScrubEnd once on pointer release", () => {
  it("onScrub fires on each pointermove while pointer is captured (during drag)", () => {
    const onScrub = vi.fn();
    const onScrubEnd = vi.fn();
    const { getByRole } = render(
      <ProgressSlider
        valueFraction={0.5}
        onScrub={onScrub}
        onScrubEnd={onScrubEnd}
        ariaLabel="Playback progress"
      />,
    );
    const slider = getByRole("slider");

    fireEvent.pointerDown(slider, { clientX: 50, pointerId: 1 });
    fireEvent.pointerMove(slider, { clientX: 60, pointerId: 1 });
    fireEvent.pointerMove(slider, { clientX: 70, pointerId: 1 });

    // onScrub called on pointerdown + 2 pointermoves = at least 2 calls
    expect(onScrub.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(onScrubEnd).not.toHaveBeenCalled();
  });

  it("onScrubEnd fires exactly once on pointerup", () => {
    const onScrub = vi.fn();
    const onScrubEnd = vi.fn();
    const { getByRole } = render(
      <ProgressSlider
        valueFraction={0.5}
        onScrub={onScrub}
        onScrubEnd={onScrubEnd}
        ariaLabel="Playback progress"
      />,
    );
    const slider = getByRole("slider");

    fireEvent.pointerDown(slider, { clientX: 50, pointerId: 1 });
    fireEvent.pointerMove(slider, { clientX: 60, pointerId: 1 });
    fireEvent.pointerUp(slider, { clientX: 60, pointerId: 1 });

    expect(onScrubEnd).toHaveBeenCalledTimes(1);
  });

  it("onScrubEnd does NOT fire during the drag (pointermove) phase", () => {
    const onScrub = vi.fn();
    const onScrubEnd = vi.fn();
    const { getByRole } = render(
      <ProgressSlider
        valueFraction={0.5}
        onScrub={onScrub}
        onScrubEnd={onScrubEnd}
        ariaLabel="Playback progress"
      />,
    );
    const slider = getByRole("slider");

    fireEvent.pointerDown(slider, { clientX: 50, pointerId: 1 });
    fireEvent.pointerMove(slider, { clientX: 60, pointerId: 1 });
    fireEvent.pointerMove(slider, { clientX: 70, pointerId: 1 });
    fireEvent.pointerMove(slider, { clientX: 80, pointerId: 1 });

    // Still in drag phase — onScrubEnd must not have fired yet
    expect(onScrubEnd).not.toHaveBeenCalled();
  });

  it("onScrub does NOT fire after pointerup", () => {
    const onScrub = vi.fn();
    const onScrubEnd = vi.fn();
    const { getByRole } = render(
      <ProgressSlider
        valueFraction={0.5}
        onScrub={onScrub}
        onScrubEnd={onScrubEnd}
        ariaLabel="Playback progress"
      />,
    );
    const slider = getByRole("slider");

    fireEvent.pointerDown(slider, { clientX: 50, pointerId: 1 });
    fireEvent.pointerMove(slider, { clientX: 60, pointerId: 1 });
    fireEvent.pointerUp(slider, { clientX: 60, pointerId: 1 });

    const callsBeforePost = onScrub.mock.calls.length;

    // More pointermove events after release should not fire onScrub
    fireEvent.pointerMove(slider, { clientX: 70, pointerId: 1 });
    fireEvent.pointerMove(slider, { clientX: 80, pointerId: 1 });

    expect(onScrub.mock.calls.length).toBe(callsBeforePost);
  });
});
