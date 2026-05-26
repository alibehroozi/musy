// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-33, API-34, API-35.

import { describe, it } from "vitest";

describe("API-33: taste-driven phase never emits phase: 'artist-refinement' at runtime", () => {
  it.todo("phaseFor with any non-null profile never returns 'artist-refinement'");
  it.todo("QueueBuilderService persisted phase is always 'discovery' or 'personalized'");
});

describe("API-34: taste-driven candidate pool is sourced from Claude-generated adjacent artists", () => {
  it.todo("sourceTasteDriven calls Claude for related artists before any SoundCloud search");
  it.todo("fallback to direct profile-artist search when related-artists Claude call fails");
  it.todo("final-pick Claude call failure returns deduped pool first 25 entries");
});

describe("API-35: phaseFor returns only 'discovery' or 'personalized'", () => {
  it.todo("phaseFor(null, any) === 'discovery'");
  it.todo("phaseFor(nonNullProfile, any) === 'personalized'");
  it.todo("phaseFor never returns 'artist-refinement'");
});
