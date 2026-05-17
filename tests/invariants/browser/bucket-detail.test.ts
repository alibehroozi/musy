// Layer 3 — Playwright. Real assertions live in
// `apps/web/tests/e2e/bucket-detail.spec.ts`.
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under BROWSER-08.

import { describe, it } from "vitest";

describe("BROWSER-08: /taste/buckets/:bucketId mobile layout + WCAG AA across all states", () => {
  it.todo(
    "populated state: 375×667 visual snapshot is stable + axe-core WCAG 2.1 AA passes (apps/web/tests/e2e/bucket-detail.spec.ts)",
  );
  it.todo(
    "building state: 375×667 visual snapshot is stable + axe-core WCAG 2.1 AA passes (apps/web/tests/e2e/bucket-detail.spec.ts)",
  );
  it.todo(
    "failed state: 375×667 visual snapshot is stable + axe-core WCAG 2.1 AA passes (apps/web/tests/e2e/bucket-detail.spec.ts)",
  );
  it.todo(
    "not-found state (404): 375×667 visual snapshot is stable + axe-core WCAG 2.1 AA passes (apps/web/tests/e2e/bucket-detail.spec.ts)",
  );
  it.todo(
    "error state (5xx/network): 375×667 visual snapshot is stable + axe-core WCAG 2.1 AA passes (apps/web/tests/e2e/bucket-detail.spec.ts)",
  );
  it.todo(
    "Play-all button satisfies 44×44 px touch-target minimum (apps/web/tests/e2e/bucket-detail.spec.ts)",
  );
});
