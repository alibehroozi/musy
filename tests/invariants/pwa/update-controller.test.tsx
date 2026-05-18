// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PWA-04 and PWA-05.

import { describe, it } from "vitest";

describe("PWA-04: SW update controller registers + checks on schedule + visibility", () => {
  it.todo("on mount, requests a SW registration exactly once");
  it.todo("schedules a periodic update check at >= 30 minutes and tears it down on unmount");
  it.todo("calls registration.update() when document visibility transitions to visible");
  it.todo("removes the visibilitychange listener on unmount");
});

describe("PWA-05: needRefresh banner + self-apply on next focus", () => {
  it.todo("when onNeedRefresh fires, the UpdateAvailableBanner is rendered with Refresh + Later");
  it.todo("clicking Refresh invokes updateSW(true)");
  it.todo("clicking Later hides the banner for the session but keeps needRefresh internally");
  it.todo(
    "on next visibilitychange→visible with needRefresh true and no active playback, updateSW(true) is invoked silently",
  );
  it.todo(
    "when playback is active, the silent self-apply is suppressed and the banner remains hidden until next focus",
  );
});
