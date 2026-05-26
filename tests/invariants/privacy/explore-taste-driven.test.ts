// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PRIVACY-17.

import { describe, it, expect } from "vitest";
import type { TasteProfile } from "@moc/contracts";
import {
  buildRelatedArtistsPrompt,
  RELATED_ARTISTS_HIGH_BUCKET_SAMPLE_CAP,
  type HighBucketSample,
} from "@moc/api-core";

function profile(): TasteProfile {
  return {
    userId: "u1",
    genres: [{ name: "house", score: 0.8 }],
    artists: [{ name: "Disclosure", score: 0.9 }],
    tempoBucket: "fast",
    remixPreference: "original",
    summaryText: "Loves house music.",
    lastBuiltAt: "2026-05-10T00:00:00.000Z",
    swipeCountAtLastBuild: 30,
  };
}

function makeSamples(count: number): HighBucketSample[] {
  return Array.from({ length: count }, (_, i) => ({
    title: `Song ${i}`,
    artist: `Artist ${i}`,
  }));
}

describe("PRIVACY-17: highBucketSamples is capped at 10 entries and not sorted by score", () => {
  it("buildRelatedArtistsPrompt with > 10 high-bucket samples only forwards 10 in the prompt body", () => {
    const over = makeSamples(RELATED_ARTISTS_HIGH_BUCKET_SAMPLE_CAP + 5);
    const out = buildRelatedArtistsPrompt({
      profile: profile(),
      highBucketSamples: over,
      shuffledSeedArtists: ["Disclosure"],
    });
    const payload = JSON.parse(out.userMessage) as {
      highBucketSamples: unknown[];
    };
    expect(payload.highBucketSamples.length).toBe(RELATED_ARTISTS_HIGH_BUCKET_SAMPLE_CAP);
  });

  it("the 10 forwarded entries are {title, artist} only — no score values", () => {
    const samples = makeSamples(RELATED_ARTISTS_HIGH_BUCKET_SAMPLE_CAP);
    const out = buildRelatedArtistsPrompt({
      profile: profile(),
      highBucketSamples: samples,
      shuffledSeedArtists: [],
    });
    const payload = JSON.parse(out.userMessage) as {
      highBucketSamples: Array<Record<string, unknown>>;
    };
    for (const entry of payload.highBucketSamples) {
      expect(Object.keys(entry).sort()).toEqual(["artist", "title"]);
    }
  });

  it("the prompt body does not contain a score field for any high-bucket sample entry", () => {
    const over = makeSamples(RELATED_ARTISTS_HIGH_BUCKET_SAMPLE_CAP + 3);
    const out = buildRelatedArtistsPrompt({
      profile: profile(),
      highBucketSamples: over,
      shuffledSeedArtists: [],
    });
    const payload = JSON.parse(out.userMessage) as {
      highBucketSamples: Array<Record<string, unknown>>;
    };
    for (const entry of payload.highBucketSamples) {
      expect("score" in entry).toBe(false);
    }
  });
});
