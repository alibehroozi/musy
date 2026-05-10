// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PRIVACY-08.

import { describe, it } from "vitest";

describe("PRIVACY-08: taste-profile build prompt is a function only of (recentSwipes, recentListens, previousSummary)", () => {
  it.todo(
    "the rendered (system, userMessage) bytes never contain any of the userId / email / IP / session token strings of the user being built for",
  );
  it.todo(
    "changing only userId / email / IP / session — but keeping recentSwipes/Listens/Summary equal — produces identical (system, userMessage) bytes",
  );
  it.todo(
    "the buildTastePrompt source contains no fetch / http(s) / network primitive — pure-logic boundary",
  );
});
