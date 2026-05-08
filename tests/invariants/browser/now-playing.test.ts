// Layer 3 — Playwright required.
// These tests are stubs until the Playwright harness is configured.
// See INVARIANTS.md: BROWSER-04.

import { describe, it } from "vitest";

describe("BROWSER-04: now-playing screen fits without horizontal scroll; cover ≥ 240px; buttons ≥ 44×44 touch targets", () => {
  it.todo("on a 375×667 viewport, the now-playing screen has no horizontal scroll");
  it.todo("on a 375×667 viewport, the cover art is at least 240×240 px");
  it.todo(
    "on a 375×667 viewport, play/pause, skip-back, and skip-forward buttons each have a touch target ≥ 44×44 px",
  );
});
