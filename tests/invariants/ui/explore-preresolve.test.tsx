// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-21, UI-22.

import { describe, it } from "vitest";

describe("UI-21: pre-resolved URL failure recovery (retry once via /play/resolve)", () => {
  it.todo(
    "when a loadPreview-loaded top card emits engine.errored before reaching 'playing', the FE re-issues POST /api/play/resolve for the same snapshot and re-attempts load with the fresh URL",
  );
  it.todo(
    "the retry path drops the stale entry from the in-memory resolveCache before re-resolving",
  );
  it.todo(
    "when the retry's /api/play/resolve returns streamUrl: null, the engine reaches the terminal UI-12 failed state",
  );
  it.todo(
    "when the retry's load also errors, the engine reaches the terminal failed state (no infinite retry)",
  );
  it.todo(
    "the retry fires at most once per (snapshot, top-card mount) pair — a successful retry that then later errors does not trigger a second retry",
  );
  it.todo(
    "a successful first load (engine reaches 'playing') does not arm the retry path — a subsequent error event much later does not silently re-resolve",
  );
});

describe("UI-22: near-end-of-track refresh of the next-in-queue cached URL", () => {
  it.todo(
    "once playableHandoffDecision first flips true for the current track, POST /api/play/resolve fires for the next-in-queue snapshot",
  );
  it.todo(
    "the refresh fires at most once per (currentSnapshot, nextSnapshot) pair — additional timeupdates within the same near-end window do not re-fire it",
  );
  it.todo(
    "a refresh that returns a fresh URL replaces the existing cache entry for the next-in-queue snapshot",
  );
  it.todo(
    "a refresh that returns streamUrl: null leaves the existing cache entry untouched (silent fallthrough to UI-21 on the next handoff)",
  );
  it.todo(
    "a refresh whose /api/play/resolve fetch rejects does not interrupt the currently-playing track or alter queue order",
  );
  it.todo(
    "swapping the top card (or the next-in-queue snapshot) resets the once-per-pair latch — a subsequent near-end fires a fresh refresh",
  );
});
