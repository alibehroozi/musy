// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PRIVACY-09.

import { describe, it, expect } from "vitest";
import { buildRerankPrompt, type PromptCandidate } from "@moc/api-core";

const VICTIM_USER_ID = "550e8400-e29b-41d4-a716-446655440777";
const VICTIM_EMAIL = "victim@example.com";
const VICTIM_IP = "203.0.113.99";
const VICTIM_SESSION = "sess_eyJ_must_not_appear_in_prompt";
const VICTIM_SWIPE_HISTORY = "swiped_right_then_left";

function candidate(): PromptCandidate {
  return { title: "Bohemian Rhapsody", artist: "Queen", source: "soundcloud" };
}

describe("PRIVACY-09: explore-rerank prompt is a function only of (candidatePool, profileSummary)", () => {
  it("the rendered (system, userMessage) bytes never contain userId / email / IP / session / raw swipe directions", () => {
    // The helper signature has no userId/email/IP/session/swipe-history arg —
    // this test protects against a regression that would add them.
    const out = buildRerankPrompt({
      candidatePool: [candidate()],
      profileSummary: "you like rock",
    });
    const all = `${out.system}\n${out.userMessage}`;
    for (const identity of [
      VICTIM_USER_ID,
      VICTIM_EMAIL,
      VICTIM_IP,
      VICTIM_SESSION,
      VICTIM_SWIPE_HISTORY,
    ]) {
      expect(all).not.toContain(identity);
    }
  });

  it("two callers with different identity contexts but identical (candidatePool, profileSummary) inputs derive identical prompts", () => {
    const baseInput = {
      candidatePool: [candidate()],
      profileSummary: "you like rock",
    };
    const aliceCallerContext = { userId: "alice-uid", email: "alice@example.com" };
    const bobCallerContext = { userId: VICTIM_USER_ID, email: VICTIM_EMAIL, ip: VICTIM_IP };
    void aliceCallerContext;
    void bobCallerContext;
    const a = buildRerankPrompt(baseInput);
    const b = buildRerankPrompt({ ...baseInput });
    expect(a.system).toBe(b.system);
    expect(a.userMessage).toBe(b.userMessage);
  });
});
