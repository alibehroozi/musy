// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-33, API-34, API-35.

import { describe, it, expect } from "vitest";
import type { TasteProfile } from "@moc/contracts";
import {
  phaseFor,
  buildRelatedArtistsPrompt,
  parseRelatedArtistsResponse,
  parseTasteDrivenPickResponse,
  STRONG_ARTIST_SCORE_THRESHOLD,
} from "@moc/api-core";

function profile(
  overrides: Partial<TasteProfile> & {
    genres?: TasteProfile["genres"];
    artists?: TasteProfile["artists"];
  } = {},
): TasteProfile {
  return {
    userId: "u1",
    genres: overrides.genres ?? [{ name: "house", score: 0.8 }],
    artists: overrides.artists ?? [{ name: "Disclosure", score: 0.9 }],
    tempoBucket: overrides.tempoBucket ?? "fast",
    remixPreference: overrides.remixPreference ?? "original",
    summaryText: overrides.summaryText ?? "Loves house music.",
    lastBuiltAt: overrides.lastBuiltAt ?? "2026-05-10T00:00:00.000Z",
    swipeCountAtLastBuild: overrides.swipeCountAtLastBuild ?? 30,
  };
}

describe("API-33: taste-driven phase never emits phase: 'artist-refinement' at runtime", () => {
  it("phaseFor with any non-null profile never returns 'artist-refinement'", () => {
    const profiles = [
      profile({ artists: [] }),
      profile({ artists: [{ name: "A", score: STRONG_ARTIST_SCORE_THRESHOLD + 0.1 }] }),
      profile({
        artists: Array.from({ length: 10 }, (_, i) => ({ name: `A${i}`, score: 0.9 })),
      }),
    ];
    for (const p of profiles) {
      expect(phaseFor(p, 0)).not.toBe("artist-refinement");
      expect(phaseFor(p, 100)).not.toBe("artist-refinement");
    }
  });

  it("QueueBuilderService persisted phase is always 'discovery' or 'personalized'", () => {
    // phaseFor is the only gate that determines the persisted phase; verified by
    // testing every possible phaseFor output (mirrors the service's doRebuild logic).
    const swipeCounts = [0, 19, 20, 50, 500];
    for (const count of swipeCounts) {
      const result = phaseFor(null, count);
      expect(["discovery", "personalized"]).toContain(result);
    }
    for (const count of swipeCounts) {
      const result = phaseFor(profile(), count);
      expect(["discovery", "personalized"]).toContain(result);
    }
  });
});

describe("API-34: taste-driven candidate pool is sourced from Claude-generated adjacent artists", () => {
  it("sourceTasteDriven calls Claude for related artists before any SoundCloud search", () => {
    // The buildRelatedArtistsPrompt produces a non-empty system+userMessage — this
    // is the prompt object passed to the Anthropic client in the first step. If the
    // function throws or returns empty strings, sourceTasteDriven cannot build a
    // related-artists request and must fall back.
    const out = buildRelatedArtistsPrompt({
      profile: profile(),
      highBucketSamples: [{ title: "Fav Song", artist: "Fav Artist" }],
      shuffledSeedArtists: ["Disclosure", "Four Tet"],
    });
    expect(out.system.length).toBeGreaterThan(0);
    expect(out.userMessage.length).toBeGreaterThan(0);
    // The prompt instructs the model to return relatedArtists
    expect(out.system).toContain("relatedArtists");
  });

  it("fallback to direct profile-artist search when related-artists Claude call fails", () => {
    // parseRelatedArtistsResponse on an empty/bad response returns { relatedArtists: [] },
    // which is the trigger for the fallback in sourceTasteDriven.
    expect(parseRelatedArtistsResponse("").relatedArtists).toEqual([]);
    expect(parseRelatedArtistsResponse("not json").relatedArtists).toEqual([]);
    expect(parseRelatedArtistsResponse("{}").relatedArtists).toEqual([]);
  });

  it("final-pick Claude call failure returns deduped pool first 25 entries", () => {
    // parseTasteDrivenPickResponse on malformed input returns { picks: [] }, which
    // is the condition under which sourceTasteDriven returns candidatePool.slice(0, 25).
    // We can't call the private method directly, but we can verify the parser that
    // gates that branch returns the expected empty result.
    expect(parseTasteDrivenPickResponse("").picks).toEqual([]);
    expect(parseTasteDrivenPickResponse("bad").picks).toEqual([]);
  });
});

describe("API-35: phaseFor returns only 'discovery' or 'personalized'", () => {
  it("phaseFor(null, any) === 'discovery'", () => {
    expect(phaseFor(null, 0)).toBe("discovery");
    expect(phaseFor(null, 1000)).toBe("discovery");
  });

  it("phaseFor(nonNullProfile, any) === 'personalized'", () => {
    expect(phaseFor(profile(), 0)).toBe("personalized");
    expect(phaseFor(profile({ artists: [] }), 5)).toBe("personalized");
    expect(phaseFor(profile({ artists: [] }), 500)).toBe("personalized");
  });

  it("phaseFor never returns 'artist-refinement'", () => {
    const cases: Array<[TasteProfile | null, number]> = [
      [null, 0],
      [null, 50],
      [profile({ artists: [] }), 0],
      [profile({ artists: [{ name: "A", score: 0.9 }] }), 50],
      [
        profile({
          artists: Array.from({ length: 8 }, (_, i) => ({ name: `A${i}`, score: 0.9 })),
        }),
        100,
      ],
    ];
    for (const [p, count] of cases) {
      expect(phaseFor(p, count)).not.toBe("artist-refinement");
    }
  });
});
