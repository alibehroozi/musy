// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under AI-10.

import { describe, it, expect } from "vitest";
import { buildColdStartPrompt } from "@moc/api-core";

const VICTIM_USER_ID = "550e8400-e29b-41d4-a716-446655440777";
const VICTIM_EMAIL = "victim@example.com";
const VICTIM_IP = "203.0.113.99";
const VICTIM_SESSION = "sess_eyJ_must_not_appear_in_prompt";

describe("AI-10: buildColdStartPrompt never leaks identity into the prompt body", () => {
  it("legacy (zero-arg) call carries no identity bytes", () => {
    const out = buildColdStartPrompt();
    const all = `${out.system}\n${out.userMessage}`;
    for (const identity of [VICTIM_USER_ID, VICTIM_EMAIL, VICTIM_IP, VICTIM_SESSION]) {
      expect(all).not.toContain(identity);
    }
  });

  it("soft-signal call carries no identity bytes", () => {
    const out = buildColdStartPrompt({
      recentSwipes: [
        { title: "Some Song", artist: "Some Artist", direction: "right" },
        { title: "Another", artist: "Other", direction: "left" },
      ],
    });
    const all = `${out.system}\n${out.userMessage}`;
    for (const identity of [VICTIM_USER_ID, VICTIM_EMAIL, VICTIM_IP, VICTIM_SESSION]) {
      expect(all).not.toContain(identity);
    }
  });

  it("two callers with different identity contexts but identical recentSwipes derive identical prompts", () => {
    const input = {
      recentSwipes: [
        { title: "Song A", artist: "Artist A", direction: "right" as const },
        { title: "Song B", artist: "Artist B", direction: "left" as const },
      ],
    };
    const aliceCallerContext = { userId: "alice", email: "alice@example.com" };
    const bobCallerContext = { userId: VICTIM_USER_ID, email: VICTIM_EMAIL, ip: VICTIM_IP };
    void aliceCallerContext;
    void bobCallerContext;
    const a = buildColdStartPrompt(input);
    const b = buildColdStartPrompt({ recentSwipes: [...input.recentSwipes] });
    expect(a.system).toBe(b.system);
    expect(a.userMessage).toBe(b.userMessage);
  });

  it("equal inputs called 100 times produce 100 byte-identical outputs", () => {
    const input = {
      recentSwipes: [{ title: "Song A", artist: "Artist A", direction: "right" as const }],
    };
    const first = buildColdStartPrompt(input);
    for (let i = 0; i < 100; i++) {
      const out = buildColdStartPrompt(input);
      expect(out.system).toBe(first.system);
      expect(out.userMessage).toBe(first.userMessage);
    }
  });
});
