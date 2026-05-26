// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under AI-18, AI-19.

import { describe, it, expect } from "vitest";
import type { TasteProfile } from "@moc/contracts";
import {
  buildRelatedArtistsPrompt,
  buildTasteDrivenPickPrompt,
  type HighBucketSample,
  type TasteDrivenPromptCandidate,
  type TasteDrivenScoreBuckets,
} from "@moc/api-core";

const VICTIM_USER_ID = "550e8400-e29b-41d4-a716-446655440777";
const VICTIM_EMAIL = "victim@example.com";
const VICTIM_IP = "203.0.113.99";
const VICTIM_SESSION = "sess_eyJ_must_not_appear_in_prompt";

function profile(overrides: Partial<TasteProfile> = {}): TasteProfile {
  return {
    userId: VICTIM_USER_ID,
    genres: overrides.genres ?? [{ name: "indie rock", score: 0.85 }],
    artists: overrides.artists ?? [{ name: "Tame Impala", score: 0.9 }],
    tempoBucket: overrides.tempoBucket ?? "mid",
    remixPreference: overrides.remixPreference ?? "original",
    summaryText: overrides.summaryText ?? "Likes dreamy psychedelic indie.",
    lastBuiltAt: overrides.lastBuiltAt ?? "2026-05-10T00:00:00.000Z",
    swipeCountAtLastBuild: overrides.swipeCountAtLastBuild ?? 25,
  };
}

function highBucketSamples(): HighBucketSample[] {
  return [
    { title: "Song A", artist: "Artist A" },
    { title: "Song B", artist: "Artist B" },
  ];
}

function pool(count: number): TasteDrivenPromptCandidate[] {
  return Array.from({ length: count }, (_, i) => ({
    title: `Track ${i}`,
    artist: `Artist ${i}`,
    source: "soundcloud" as const,
  }));
}

function scoreBuckets(): TasteDrivenScoreBuckets {
  return {
    low: [{ title: "Lo", artist: "LaArtist" }],
    mid: [{ title: "Mi", artist: "MiArtist" }],
    high: [{ title: "Hi", artist: "HiArtist" }],
  };
}

describe("AI-18: buildRelatedArtistsPrompt never leaks identity into the prompt body", () => {
  it("(system, userMessage) bytes never contain userId / email / IP / session / numeric scores", () => {
    const out = buildRelatedArtistsPrompt({
      profile: profile(),
      highBucketSamples: highBucketSamples(),
      shuffledSeedArtists: ["Tame Impala"],
    });
    const body = out.system + out.userMessage;
    expect(body).not.toContain(VICTIM_USER_ID);
    expect(body).not.toContain(VICTIM_EMAIL);
    expect(body).not.toContain(VICTIM_IP);
    expect(body).not.toContain(VICTIM_SESSION);
  });

  it("highBucketSamples entries in the prompt body are {title, artist} only — no score values", () => {
    const out = buildRelatedArtistsPrompt({
      profile: profile(),
      highBucketSamples: highBucketSamples(),
      shuffledSeedArtists: [],
    });
    const payload = JSON.parse(out.userMessage) as {
      highBucketSamples: Array<Record<string, unknown>>;
    };
    for (const entry of payload.highBucketSamples) {
      expect("score" in entry).toBe(false);
      expect(Object.keys(entry).sort()).toEqual(["artist", "title"]);
    }
  });

  it("is deterministic: equal inputs produce byte-identical (system, userMessage)", () => {
    const input = {
      profile: profile(),
      highBucketSamples: highBucketSamples(),
      shuffledSeedArtists: ["Portishead", "Massive Attack"],
    };
    const a = buildRelatedArtistsPrompt(input);
    const b = buildRelatedArtistsPrompt(input);
    expect(a.system).toBe(b.system);
    expect(a.userMessage).toBe(b.userMessage);
  });
});

describe("AI-19: buildTasteDrivenPickPrompt never leaks identity into the prompt body", () => {
  it("(system, userMessage) bytes never contain userId / email / IP / session / raw swipe history", () => {
    const out = buildTasteDrivenPickPrompt({
      profile: profile(),
      candidatePool: pool(5),
      scoreBuckets: scoreBuckets(),
    });
    const body = out.system + out.userMessage;
    expect(body).not.toContain(VICTIM_USER_ID);
    expect(body).not.toContain(VICTIM_EMAIL);
    expect(body).not.toContain(VICTIM_IP);
    expect(body).not.toContain(VICTIM_SESSION);
  });

  it("score-bucket entries in the prompt body are {title, artist} only", () => {
    const out = buildTasteDrivenPickPrompt({
      profile: profile(),
      candidatePool: pool(5),
      scoreBuckets: scoreBuckets(),
    });
    const payload = JSON.parse(out.userMessage) as {
      scoreBuckets: {
        low: Array<Record<string, unknown>>;
        mid: Array<Record<string, unknown>>;
        high: Array<Record<string, unknown>>;
      };
    };
    const allEntries = [
      ...payload.scoreBuckets.low,
      ...payload.scoreBuckets.mid,
      ...payload.scoreBuckets.high,
    ];
    for (const entry of allEntries) {
      expect("score" in entry).toBe(false);
      expect(Object.keys(entry).sort()).toEqual(["artist", "title"]);
    }
  });

  it("is deterministic: equal inputs produce byte-identical (system, userMessage)", () => {
    const input = {
      profile: profile(),
      candidatePool: pool(10),
      scoreBuckets: scoreBuckets(),
    };
    const a = buildTasteDrivenPickPrompt(input);
    const b = buildTasteDrivenPickPrompt(input);
    expect(a.system).toBe(b.system);
    expect(a.userMessage).toBe(b.userMessage);
  });
});
