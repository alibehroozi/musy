// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-07, API-08.

import { describe, it } from "vitest";

describe("API-07: POST /play/resolve is public; returns 400 on bad snapshot; returns 200 source:null when no provider matches", () => {
  it.todo("returns non-401 without a session cookie");
  it.todo("returns 400 + ErrorResponse when snapshot is missing from body");
  it.todo("returns 400 + ErrorResponse when snapshot.title is missing");
  it.todo("returns 200 with source:null and streamUrl:null when no provider matches");
});

describe("API-08: POST /play/resolve response always conforms to ResolveResponse Zod schema", () => {
  it.todo("response matches ResolveResponse schema when Audius returns a match");
  it.todo("response matches ResolveResponse schema when both providers fail");
  it.todo("response matches ResolveResponse schema when SoundCloud is the fallback");
});
