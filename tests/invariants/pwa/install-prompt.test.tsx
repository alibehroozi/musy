// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PWA-06.

import { describe, it } from "vitest";

describe("PWA-06: install prompt capture + dismissal + iOS hint", () => {
  it.todo(
    "the controller listens for beforeinstallprompt, calls preventDefault, and stores the event",
  );
  it.todo(
    "InstallPromptBanner renders only when a captured event exists AND no dismissal is stored",
  );
  it.todo(
    "clicking Install invokes the captured event's prompt() and hides the banner regardless of choice",
  );
  it.todo("clicking Later persists a dismissal in localStorage and hides the banner");
  it.todo(
    "when matchMedia('(display-mode: standalone)') matches OR navigator.standalone is true, neither banner nor iOS hint renders",
  );
  it.todo(
    "on iOS Safari (no beforeinstallprompt), IosInstallHint renders the share-sheet add-to-home-screen instructions until dismissed",
  );
});
