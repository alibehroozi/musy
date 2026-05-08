// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-*.

import { describe, it } from "vitest";

describe("LOGIC-01: The search aggregator's dedupe + merge function is deterministic", () => {
  it.todo("same provider results produce identical output on repeated calls");
  it.todo("output order is stable given the same input order");
});

describe("LOGIC-02: withTimeout resolves within timeout + 100ms even when the wrapped promise never settles", () => {
  it.todo("a promise that never resolves causes withTimeout to reject after the given timeout");
  it.todo("rejection happens within timeout + 100ms");
});

describe("LOGIC-03: Dedupe collapses matching results into a single result preserving all source providers", () => {
  it.todo("two results with the same ISRC collapse to one result with both providers in sources");
  it.todo("two results with title+artist within Levenshtein distance 3 collapse to one");
  it.todo("two results with different ISRC and dissimilar title+artist stay separate");
  it.todo("deduplicated result sources list contains every contributing provider exactly once");
});
