// Layer 3 — Playwright. Real assertions live in
// `apps/web/tests/e2e/safe-area-top.spec.ts`.
//
// If a test fails, fix the source code, not the test.
//
// Invariant verified here is listed in INVARIANTS.md under BROWSER-09:
// on iOS PWA standalone (apple-mobile-web-app-status-bar-style:
// black-translucent + viewport-fit=cover), the OS status bar overlays
// web content. The app shell's outermost container and the
// now-playing overlay must reserve space via env(safe-area-inset-top)
// or the device's clock / notch overlaps the first row of content.
// The bottom edge stays flush — only the bottom-nav handles its own
// safe-area-inset-bottom (BROWSER-01), nothing else.

import { describe, it } from "vitest";

describe("BROWSER-09: top safe-area inset on PWA standalone", () => {
  it.todo(
    "the App shell's outermost container has inline padding-top referencing env(safe-area-inset-top) (apps/web/tests/e2e/safe-area-top.spec.ts)",
  );
  it.todo(
    "the now-playing overlay's outer container has inline padding-top referencing env(safe-area-inset-top) (apps/web/tests/e2e/safe-area-top.spec.ts)",
  );
  it.todo(
    "the App shell's outermost container does NOT add bottom-inset padding — nav stays flush to viewport bottom (apps/web/tests/e2e/safe-area-top.spec.ts)",
  );
  it.todo(
    "the BottomNav clamps env(safe-area-inset-bottom) at 12px via min() so the iPhone home-bar buffer matches the indicator pill, not the full gesture zone (apps/web/tests/e2e/safe-area-top.spec.ts)",
  );
});
