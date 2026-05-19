// Layer 3 — Playwright. Real assertions live in
// `apps/web/tests/e2e/document-lock.spec.ts`.
//
// If a test fails, fix the source code, not the test.
//
// Invariant verified here is listed in INVARIANTS.md under BROWSER-10:
// on iOS PWA standalone, html/body must be locked (overflow:hidden,
// height:100%, overscroll-behavior:none) and the App-shell scroll
// container must overscroll-behavior:contain. Without this, the user
// can drag the bottom-nav downward and iOS exposes a strip of body
// bg below the fixed wrapper during the rubber-band animation.

import { describe, it } from "vitest";

describe("BROWSER-10: iOS PWA document viewport lock", () => {
  it.todo(
    "html has overflow:hidden + height:100% + overscroll-behavior:none (apps/web/tests/e2e/document-lock.spec.ts)",
  );
  it.todo(
    "body has overflow:hidden + height:100% + overscroll-behavior:none (apps/web/tests/e2e/document-lock.spec.ts)",
  );
  it.todo(
    "the app-shell scroll container has overscroll-behavior:contain (apps/web/tests/e2e/document-lock.spec.ts)",
  );
});
