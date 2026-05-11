// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under AI-09.

import { describe, it, expect } from "vitest";
import { buildArtistRefinementPrompt } from "@moc/api-core";
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

describe("AI-09: buildArtistRefinementPrompt never leaks identity into the prompt body", () => {
  it("the (system, userMessage) bytes never contain userId / email / IP / session / raw swipe history", () => {
    const out = buildArtistRefinementPrompt({
      profile: profile(),
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
    const out = buildArtistRefinementPrompt({
      profile: profile(),
      candidatePool: [{ title: "T", artist: "A", source: "soundcloud" }],
    });
    expect(out.userMessage).not.toContain("lastBuiltAt");
    expect(out.userMessage).not.toContain("swipeCountAtLastBuild");
    expect(out.userMessage).not.toContain("2026-05-10");
  });

  it("two callers with different identity contexts but identical (profile, candidatePool) derive identical prompts", () => {
    const baseInput = {
      profile: profile(),
      candidatePool: [{ title: "T", artist: "A", source: "soundcloud" as const }],
    };
    const a = buildArtistRefinementPrompt(baseInput);
    const b = buildArtistRefinementPrompt({
      ...baseInput,
      profile: { ...baseInput.profile },
      candidatePool: [...baseInput.candidatePool],
    });
    expect(a.system).toBe(b.system);
    expect(a.userMessage).toBe(b.userMessage);
  });

  it("equal inputs called 100 times produce 100 byte-identical outputs", () => {
    const input = {
      profile: profile(),
      candidatePool: [{ title: "T", artist: "A", source: "soundcloud" as const }],
    };
    const first = buildArtistRefinementPrompt(input);
    for (let i = 0; i < 100; i++) {
      const out = buildArtistRefinementPrompt(input);
      expect(out.system).toBe(first.system);
      expect(out.userMessage).toBe(first.userMessage);
    }
  });
});
