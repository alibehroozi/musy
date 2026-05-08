// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PRIVACY-04.

import { describe, it } from "vitest";

describe("PRIVACY-04: POST /play/started and POST /play/completed make no outgoing third-party HTTP requests; listening data stays within database tier", () => {
  it.todo("POST /play/started does not make any outgoing fetch calls");
  it.todo("POST /play/completed does not make any outgoing fetch calls");
});
