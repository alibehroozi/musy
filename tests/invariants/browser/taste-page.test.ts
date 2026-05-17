// Layer 3 — Playwright. Real assertions live in
// `apps/web/tests/e2e/taste-page-and-mix-modal-ui.spec.ts`.
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under BROWSER-07.

import { describe, it } from "vitest";

describe("BROWSER-07: /taste mobile layout + WCAG AA across all four states", () => {
  it.todo(
    "empty state: 375×667 visual snapshot is stable + axe-core WCAG 2.1 AA passes (apps/web/tests/e2e/taste-page-and-mix-modal-ui.spec.ts)",
  );
  it.todo(
    "populated state with ≥3 ready buckets: 375×667 visual snapshot is stable + axe-core WCAG 2.1 AA passes (apps/web/tests/e2e/taste-page-and-mix-modal-ui.spec.ts)",
  );
  it.todo(
    "building state with one building card + ready buckets: 375×667 visual snapshot is stable (shimmer frozen under prefers-reduced-motion) + axe-core WCAG 2.1 AA passes (apps/web/tests/e2e/taste-page-and-mix-modal-ui.spec.ts)",
  );
  it.todo(
    "mix-modal state: 375×667 visual snapshot is stable + axe-core WCAG 2.1 AA passes (apps/web/tests/e2e/taste-page-and-mix-modal-ui.spec.ts)",
  );
  it.todo(
    "modal has role='dialog' and aria-modal='true' (apps/web/tests/e2e/taste-page-and-mix-modal-ui.spec.ts)",
  );
  it.todo(
    "pressing Escape closes the modal and restores focus to the ✨ New mix trigger (apps/web/tests/e2e/taste-page-and-mix-modal-ui.spec.ts)",
  );
  it.todo(
    "clicking the scrim outside the dialog closes the modal (apps/web/tests/e2e/taste-page-and-mix-modal-ui.spec.ts)",
  );
  it.todo(
    "the empty-state 'Go to Explore' button satisfies the 44×44 px touch-target minimum (apps/web/tests/e2e/taste-page-and-mix-modal-ui.spec.ts)",
  );
});
