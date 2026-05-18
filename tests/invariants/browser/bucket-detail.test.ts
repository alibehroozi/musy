// Layer 3 — Playwright. Real assertions live in
// `apps/web/tests/e2e/bucket-detail.spec.ts`.
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under BROWSER-08.

import { describe, it } from "vitest";

describe("BROWSER-08: /taste/buckets/:bucketId mobile layout + WCAG AA across all states", () => {
  it.todo(
    "ready-populated state: 375×667 visual snapshot is stable + axe-core WCAG 2.1 AA passes (apps/web/tests/e2e/bucket-detail.spec.ts)",
  );
  it.todo(
    "building state: 375×667 visual snapshot is stable (shimmer frozen under prefers-reduced-motion) + axe-core WCAG 2.1 AA passes (apps/web/tests/e2e/bucket-detail.spec.ts)",
  );
  it.todo(
    "failed state with errorReason rendered: 375×667 visual snapshot is stable + axe-core WCAG 2.1 AA passes (apps/web/tests/e2e/bucket-detail.spec.ts)",
  );
  it.todo(
    "back affordance is keyboard-reachable (Tab focus visible) and satisfies 44×44 px touch-target minimum (apps/web/tests/e2e/bucket-detail.spec.ts)",
  );
  it.todo(
    "Play all button satisfies 44×44 px touch-target minimum (apps/web/tests/e2e/bucket-detail.spec.ts)",
  );
  it.todo(
    "page fits the viewport with no horizontal scroll (apps/web/tests/e2e/bucket-detail.spec.ts)",
  );
  it.todo(
    "/taste/buckets/<unknown-id> (404) renders a 'Bucket not found' message with back link + axe-core WCAG 2.1 AA passes (apps/web/tests/e2e/bucket-detail.spec.ts)",
  );
});
