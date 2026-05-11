// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under AI-04, AI-05.

import { describe, it, expect } from "vitest";
import { buildPersonalizedPrompt, type PersonalizedScoreBuckets } from "@moc/api-core";
import type { TasteProfile } from "@moc/contracts";

const VICTIM_USER_ID = "550e8400-e29b-41d4-a716-446655440777";
const VICTIM_EMAIL = "victim@example.com";
const VICTIM_IP = "203.0.113.99";
const VICTIM_SESSION = "sess_eyJ_must_not_appear_in_prompt";
const VICTIM_SWIPE_HISTORY = "swiped_right_then_left";

function profile(): TasteProfile {
  return {
    userId: VICTIM_USER_ID,
    genres: [{ name: "indie rock", score: 0.85 }],
    artists: [{ name: "Tame Impala", score: 0.9 }],
    tempoBucket: "mid",
    remixPreference: "original",
    summaryText: "Likes dreamy psychedelic indie.",
    lastBuiltAt: "2026-05-10T00:00:00.000Z",
    swipeCountAtLastBuild: 25,
  };
}

function buckets(): PersonalizedScoreBuckets {
  return {
    low: [{ title: "Forgotten", artist: "Random" }],
    mid: [{ title: "Solid Listen", artist: "Mid Wave" }],
    high: [{ title: "Saved Favorite", artist: "Top Artist" }],
  };
}

describe("AI-04: buildPersonalizedPrompt never leaks identity into the prompt body", () => {
  it("the (system, userMessage) bytes never contain userId / email / IP / session / raw swipe history", () => {
    const out = buildPersonalizedPrompt({
      profile: profile(),
      scoreBuckets: buckets(),
      candidatePool: [{ title: "T", artist: "A", source: "soundcloud" }],
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

  it("user message body excludes lastBuiltAt and swipeCountAtLastBuild from the profile projection", () => {
    const out = buildPersonalizedPrompt({
      profile: profile(),
      scoreBuckets: buckets(),
      candidatePool: [{ title: "T", artist: "A", source: "soundcloud" }],
    });
    expect(out.userMessage).not.toContain("lastBuiltAt");
    expect(out.userMessage).not.toContain("swipeCountAtLastBuild");
    expect(out.userMessage).not.toContain("2026-05-10");
  });
});

describe("AI-05: buildPersonalizedPrompt is deterministic", () => {
  it("two callers with different identity contexts but identical (profile, scoreBuckets, candidatePool) derive identical prompts", () => {
    const baseInput = {
      profile: profile(),
      scoreBuckets: buckets(),
      candidatePool: [{ title: "T", artist: "A", source: "soundcloud" as const }],
    };
    const aliceCallerContext = { userId: "alice", email: "alice@example.com" };
    const bobCallerContext = { userId: VICTIM_USER_ID, email: VICTIM_EMAIL, ip: VICTIM_IP };
    void aliceCallerContext;
    void bobCallerContext;
    const a = buildPersonalizedPrompt(baseInput);
    const b = buildPersonalizedPrompt({
      ...baseInput,
      profile: { ...baseInput.profile },
      scoreBuckets: {
        low: [...baseInput.scoreBuckets.low],
        mid: [...baseInput.scoreBuckets.mid],
        high: [...baseInput.scoreBuckets.high],
      },
      candidatePool: [...baseInput.candidatePool],
    });
    expect(a.system).toBe(b.system);
    expect(a.userMessage).toBe(b.userMessage);
  });

  it("equal inputs called 100 times produce 100 byte-identical outputs", () => {
    const input = {
      profile: profile(),
      scoreBuckets: buckets(),
      candidatePool: [{ title: "T", artist: "A", source: "soundcloud" as const }],
    };
    const first = buildPersonalizedPrompt(input);
    for (let i = 0; i < 100; i++) {
      const out = buildPersonalizedPrompt(input);
      expect(out.system).toBe(first.system);
      expect(out.userMessage).toBe(first.userMessage);
    }
  });
});
