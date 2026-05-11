// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-26, LOGIC-27.

import { describe, it, expect } from "vitest";
import {
  buildArtistRefinementPrompt,
  parseArtistRefinementResponse,
  type BuildArtistRefinementPromptInput,
} from "./artist-refinement-prompt.js";
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

const VALID_INPUT: BuildArtistRefinementPromptInput = {
  profile: profile(),
  candidatePool: [
    { title: "New Single", artist: "Tame Impala", source: "soundcloud" },
    { title: "Deep Cut", artist: "Caribou", source: "soundcloud" },
  ],
};

describe("LOGIC-26: buildArtistRefinementPrompt produces a (system, userMessage) pair", () => {
  it("returns both system and userMessage as non-empty strings", () => {
    const out = buildArtistRefinementPrompt(VALID_INPUT);
    expect(out.system).toBeTypeOf("string");
    expect(out.userMessage).toBeTypeOf("string");
    expect(out.system.length).toBeGreaterThan(0);
    expect(out.userMessage.length).toBeGreaterThan(0);
  });

  it("system prompt asks for exactly 20 picks_from_pool verbatim and never asks for novel suggestions", () => {
    const out = buildArtistRefinementPrompt(VALID_INPUT);
    expect(out.system).toContain("picks");
    expect(out.system).toContain("20");
    expect(out.system).toContain("verbatim");
    // No "novel" half — refinement is pool-only.
    expect(out.system.toLowerCase()).not.toContain("novel");
  });

  it("user message body contains profile and candidatePool projections (no scoreBuckets)", () => {
    const out = buildArtistRefinementPrompt(VALID_INPUT);
    const parsed = JSON.parse(out.userMessage) as Record<string, unknown>;
    expect(parsed).toHaveProperty("profile");
    expect(parsed).toHaveProperty("candidatePool");
    expect(parsed).not.toHaveProperty("scoreBuckets");
  });

  it("is deterministic — equal inputs produce byte-identical (system, userMessage)", () => {
    const a = buildArtistRefinementPrompt(VALID_INPUT);
    const b = buildArtistRefinementPrompt({
      ...VALID_INPUT,
      profile: { ...VALID_INPUT.profile },
      candidatePool: [...VALID_INPUT.candidatePool],
    });
    expect(a.system).toBe(b.system);
    expect(a.userMessage).toBe(b.userMessage);
  });

  it("user message includes only the projected profile fields (no userId, no lastBuiltAt, no swipeCountAtLastBuild)", () => {
    const out = buildArtistRefinementPrompt(VALID_INPUT);
    expect(out.userMessage).not.toContain("u-test");
    expect(out.userMessage).not.toContain("2026-05-10");
    expect(out.userMessage).not.toContain("swipeCountAtLastBuild");
  });

  it("candidate-pool entries carry only {title, artist, source}", () => {
    const out = buildArtistRefinementPrompt({
      ...VALID_INPUT,
      candidatePool: [{ title: "T", artist: "A", source: "soundcloud" }],
    });
    const parsed = JSON.parse(out.userMessage) as {
      candidatePool: Array<Record<string, unknown>>;
    };
    expect(Object.keys(parsed.candidatePool[0]!).sort()).toEqual(["artist", "source", "title"]);
  });

  it("accepts long summaryText without truncation surprises (DATA-11 unbounds storage; prompt enforces byte cap)", () => {
    const longProfile = profile({ summaryText: "x".repeat(8 * 1024) });
    const out = buildArtistRefinementPrompt({
      profile: longProfile,
      candidatePool: [{ title: "T", artist: "A", source: "soundcloud" }],
    });
    const parsed = JSON.parse(out.userMessage) as { profile: { summaryText: string } };
    // The builder is free to truncate for byte-budget hygiene, but must never throw.
    expect(typeof parsed.profile.summaryText).toBe("string");
    expect(parsed.profile.summaryText.length).toBeGreaterThan(0);
  });
});

describe("LOGIC-27: parseArtistRefinementResponse tolerates LLM JSON wrappers", () => {
  const BARE_OBJECT = JSON.stringify({
    picks: [
      { title: "New Single", artist: "Tame Impala" },
      { title: "Deep Cut", artist: "Caribou" },
    ],
  });

  it("parses bare JSON (happy path)", () => {
    const out = parseArtistRefinementResponse(BARE_OBJECT);
    expect(out.picks).toHaveLength(2);
    expect(out.picks[0]).toEqual({ title: "New Single", artist: "Tame Impala" });
  });

  it("parses JSON wrapped in ```json … ``` fences (Haiku output shape)", () => {
    const fenced = "```json\n" + BARE_OBJECT + "\n```";
    const out = parseArtistRefinementResponse(fenced);
    expect(out.picks).toHaveLength(2);
  });

  it("parses JSON wrapped in plain ``` … ``` fences (no language tag)", () => {
    const fenced = "```\n" + BARE_OBJECT + "\n```";
    const out = parseArtistRefinementResponse(fenced);
    expect(out.picks).toHaveLength(2);
  });

  it("parses JSON preceded by prose and followed by prose", () => {
    const wrapped = `Sure! Here are your picks:\n\n${BARE_OBJECT}\n\nLet me know if you'd like different ones.`;
    const out = parseArtistRefinementResponse(wrapped);
    expect(out.picks).toHaveLength(2);
  });

  it("returns empty picks for empty / null-ish inputs (never throws)", () => {
    expect(parseArtistRefinementResponse("")).toEqual({ picks: [] });
    expect(parseArtistRefinementResponse("   ")).toEqual({ picks: [] });
    expect(parseArtistRefinementResponse("nothing here")).toEqual({ picks: [] });
  });

  it("returns empty picks when `picks` is missing", () => {
    const noPicks = JSON.stringify({ other: [{ title: "X", artist: "Y" }] });
    expect(parseArtistRefinementResponse(noPicks)).toEqual({ picks: [] });
  });

  it("drops malformed entries silently and keeps the well-formed ones", () => {
    const mixed = JSON.stringify({
      picks: [
        { title: "OK", artist: "Yes" },
        { title: 42, artist: "BadTitle" },
        { artist: "NoTitle" },
        { title: "AlsoOK", artist: "Sure" },
      ],
    });
    const out = parseArtistRefinementResponse(mixed);
    expect(out.picks).toEqual([
      { title: "OK", artist: "Yes" },
      { title: "AlsoOK", artist: "Sure" },
    ]);
  });

  it("is deterministic — same input always produces the same output", () => {
    const fenced = "```json\n" + BARE_OBJECT + "\n```";
    const a = parseArtistRefinementResponse(fenced);
    const b = parseArtistRefinementResponse(fenced);
    expect(a).toEqual(b);
  });

  it("returns empty picks when `picks` is the wrong type (string instead of array)", () => {
    const bad = JSON.stringify({ picks: "not an array" });
    expect(parseArtistRefinementResponse(bad)).toEqual({ picks: [] });
  });
});
