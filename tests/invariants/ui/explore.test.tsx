// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-16, UI-17, UI-18, UI-19.

import { describe, it } from "vitest";

describe("UI-16: mini-player hidden when /explore card is the player surface", () => {
  it.todo(
    "on /explore, with currentTrack matching the top card, the docked mini-player is not rendered",
  );
  it.todo("on any other route, mini-player follows UI-11 even when topCard matches currentTrack");
  it.todo("on /explore with currentTrack NOT matching topCard, mini-player is rendered");
});

describe("UI-17: onboarding overlay on first visit + localStorage flag", () => {
  it.todo(
    "with localStorage 'moc.explore.onboarded' unset, overlay renders with role=dialog and aria-modal=true",
  );
  it.todo(
    "tapping the primary action sets localStorage['moc.explore.onboarded']='1' and removes the overlay",
  );
  it.todo("with localStorage 'moc.explore.onboarded'='1', overlay does not render");
});

describe("UI-18: phase pill copy keyed off profile.phase", () => {
  it.todo("phase='discovery' → pill text is 'Discovering taste'");
  it.todo("phase='artist-refinement' → pill text is 'Finding artists'");
  it.todo("phase='personalized' → pill is absent from the DOM");
});

describe("UI-19: exactly one card carries data-explore-position='top'", () => {
  it.todo("on initial render, exactly one card carries data-explore-position='top'");
  it.todo(
    "after a swipe (or ♥ / ✕ activation), the previous top card no longer carries the attribute and the next card does",
  );
});
