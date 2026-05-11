// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-24, LOGIC-25.

import { describe, it, expect } from "vitest";
import {
  buildPersonalizedPrompt,
  parsePersonalizedResponse,
  type BuildPersonalizedPromptInput,
  type PersonalizedScoreBuckets,
} from "./personalized-prompt.js";
import type { TasteProfile } from "@moc/contracts";

function profile(overrides: Partial<TasteProfile> = {}): TasteProfile {
  return {
    userId: "u-test",
    genres: overrides.genres ?? [
      { name: "indie rock", score: 0.85 },
      { name: "synthwave", score: 0.6 },
    ],
    artists: overrides.artists ?? [
      { name: "Tame Impala", score: 0.9 },
      { name: "Caribou", score: 0.7 },
    ],
    tempoBucket: overrides.tempoBucket ?? "mid",
    remixPreference: overrides.remixPreference ?? "original",
    summaryText: overrides.summaryText ?? "Likes dreamy psychedelic indie and 80s-inspired synths.",
    lastBuiltAt: overrides.lastBuiltAt ?? "2026-05-10T00:00:00.000Z",
    swipeCountAtLastBuild: overrides.swipeCountAtLastBuild ?? 25,
  };
}

function buckets(): PersonalizedScoreBuckets {
  return {
    low: [
      { title: "Forgettable Demo", artist: "Random Indie" },
      { title: "Skip This One", artist: "Lo-Fi Anon" },
    ],
    mid: [
      { title: "Solid Listen", artist: "Mid Wave" },
      { title: "Nice Vibe", artist: "Casual Daze" },
    ],
    high: [
      { title: "Saved Favorite", artist: "Top Artist" },
      { title: "Replayed Often", artist: "Beloved Band" },
    ],
  };
}

const VALID_INPUT: BuildPersonalizedPromptInput = {
  profile: profile(),
  scoreBuckets: buckets(),
  candidatePool: [
    { title: "New Single", artist: "Tame Impala", source: "soundcloud" },
    { title: "Underground Track", artist: "Unknown Producer", source: "audius" },
  ],
};

describe("LOGIC-25: buildPersonalizedPrompt produces a (system, userMessage) pair", () => {
  it("returns both system and userMessage as non-empty strings", () => {
    const out = buildPersonalizedPrompt(VALID_INPUT);
    expect(out.system).toBeTypeOf("string");
    expect(out.userMessage).toBeTypeOf("string");
    expect(out.system.length).toBeGreaterThan(0);
    expect(out.userMessage.length).toBeGreaterThan(0);
  });

  it("system prompt references both output sections (picks_from_pool and novel_suggestions)", () => {
    const out = buildPersonalizedPrompt(VALID_INPUT);
    expect(out.system).toContain("picks_from_pool");
    expect(out.system).toContain("novel_suggestions");
  });

  it("user message body contains profile, scoreBuckets, and candidatePool projections", () => {
    const out = buildPersonalizedPrompt(VALID_INPUT);
    const parsed = JSON.parse(out.userMessage) as Record<string, unknown>;
    expect(parsed).toHaveProperty("profile");
    expect(parsed).toHaveProperty("scoreBuckets");
    expect(parsed).toHaveProperty("candidatePool");
  });

  it("is deterministic — equal inputs produce byte-identical (system, userMessage)", () => {
    const a = buildPersonalizedPrompt(VALID_INPUT);
    const b = buildPersonalizedPrompt({
      ...VALID_INPUT,
      profile: { ...VALID_INPUT.profile },
      scoreBuckets: {
        low: [...VALID_INPUT.scoreBuckets.low],
        mid: [...VALID_INPUT.scoreBuckets.mid],
        high: [...VALID_INPUT.scoreBuckets.high],
      },
      candidatePool: [...VALID_INPUT.candidatePool],
    });
    expect(a.system).toBe(b.system);
    expect(a.userMessage).toBe(b.userMessage);
  });

  it("user message includes only the projected profile fields (no userId, no lastBuiltAt, no swipeCountAtLastBuild)", () => {
    const out = buildPersonalizedPrompt(VALID_INPUT);
    expect(out.userMessage).not.toContain("u-test"); // userId
    expect(out.userMessage).not.toContain("2026-05-10"); // lastBuiltAt
    expect(out.userMessage).not.toContain("swipeCountAtLastBuild");
  });

  it("score-bucket entries only carry title + artist (not score, not coverUrl)", () => {
    const out = buildPersonalizedPrompt({
      ...VALID_INPUT,
      scoreBuckets: {
        ...VALID_INPUT.scoreBuckets,
        high: [{ title: "Saved Favorite", artist: "Top Artist" }],
      },
    });
    const parsed = JSON.parse(out.userMessage) as {
      scoreBuckets: { high: Array<Record<string, unknown>> };
    };
    expect(parsed.scoreBuckets.high[0]).toEqual({
      title: "Saved Favorite",
      artist: "Top Artist",
    });
  });
});

describe("LOGIC-24: parsePersonalizedResponse tolerates LLM JSON wrappers", () => {
  const BARE_OBJECT = JSON.stringify({
    picks_from_pool: [
      { title: "New Single", artist: "Tame Impala" },
      { title: "Underground Track", artist: "Unknown Producer" },
    ],
    novel_suggestions: [
      { title: "Discovered Gem", artist: "Hidden Talent" },
      { title: "Cross-Genre Bridge", artist: "Wide Sounds" },
    ],
  });

  it("parses bare JSON (happy path)", () => {
    const out = parsePersonalizedResponse(BARE_OBJECT);
    expect(out.picks_from_pool).toHaveLength(2);
    expect(out.novel_suggestions).toHaveLength(2);
    expect(out.picks_from_pool[0]).toEqual({ title: "New Single", artist: "Tame Impala" });
  });

  it("parses JSON wrapped in ```json … ``` fences (Haiku output shape)", () => {
    const fenced = "```json\n" + BARE_OBJECT + "\n```";
    const out = parsePersonalizedResponse(fenced);
    expect(out.picks_from_pool).toHaveLength(2);
    expect(out.novel_suggestions).toHaveLength(2);
  });

  it("parses JSON wrapped in plain ``` … ``` fences (no language tag)", () => {
    const fenced = "```\n" + BARE_OBJECT + "\n```";
    const out = parsePersonalizedResponse(fenced);
    expect(out.picks_from_pool).toHaveLength(2);
  });

  it("parses JSON preceded by prose and followed by prose", () => {
    const wrapped = `Sure! Here are your picks:\n\n${BARE_OBJECT}\n\nLet me know if you'd like different ones.`;
    const out = parsePersonalizedResponse(wrapped);
    expect(out.picks_from_pool).toHaveLength(2);
    expect(out.novel_suggestions).toHaveLength(2);
  });

  it("returns empty arrays for empty / null-ish inputs (never throws)", () => {
    expect(parsePersonalizedResponse("")).toEqual({ picks_from_pool: [], novel_suggestions: [] });
    expect(parsePersonalizedResponse("   ")).toEqual({
      picks_from_pool: [],
      novel_suggestions: [],
    });
    expect(parsePersonalizedResponse("nothing here")).toEqual({
      picks_from_pool: [],
      novel_suggestions: [],
    });
  });

  it("returns empty arrays when one of the expected keys is missing", () => {
    const onlyPicks = JSON.stringify({
      picks_from_pool: [{ title: "X", artist: "Y" }],
    });
    const out = parsePersonalizedResponse(onlyPicks);
    expect(out.picks_from_pool).toHaveLength(1);
    expect(out.novel_suggestions).toEqual([]);
  });

  it("drops malformed entries silently and keeps the well-formed ones", () => {
    const mixed = JSON.stringify({
      picks_from_pool: [
        { title: "OK", artist: "Yes" },
        { title: 42, artist: "BadTitle" },
        { artist: "NoTitle" },
        { title: "AlsoOK", artist: "Sure" },
      ],
      novel_suggestions: [{ title: "Novel1", artist: "Artist1" }],
    });
    const out = parsePersonalizedResponse(mixed);
    expect(out.picks_from_pool).toEqual([
      { title: "OK", artist: "Yes" },
      { title: "AlsoOK", artist: "Sure" },
    ]);
    expect(out.novel_suggestions).toEqual([{ title: "Novel1", artist: "Artist1" }]);
  });

  it("is deterministic — same input always produces the same output", () => {
    const fenced = "```json\n" + BARE_OBJECT + "\n```";
    const a = parsePersonalizedResponse(fenced);
    const b = parsePersonalizedResponse(fenced);
    expect(a).toEqual(b);
  });

  it("returns empty arrays when arrays have wrong types (string instead of array)", () => {
    const bad = JSON.stringify({
      picks_from_pool: "not an array",
      novel_suggestions: 42,
    });
    expect(parsePersonalizedResponse(bad)).toEqual({
      picks_from_pool: [],
      novel_suggestions: [],
    });
  });
});
