import { describe, it, expect } from "vitest";
import type { TasteProfile } from "@moc/contracts";
import { phaseFor, STRONG_ARTIST_SCORE_THRESHOLD } from "./queue-phase.js";

function profile(
  overrides: Partial<TasteProfile> & {
    genres?: TasteProfile["genres"];
    artists?: TasteProfile["artists"];
  } = {},
): TasteProfile {
  return {
    userId: "u1",
    genres: overrides.genres ?? [],
    artists: overrides.artists ?? [],
    tempoBucket: overrides.tempoBucket ?? null,
    remixPreference: overrides.remixPreference ?? null,
    summaryText: overrides.summaryText ?? "",
    lastBuiltAt: overrides.lastBuiltAt ?? "2026-05-10T00:00:00.000Z",
    swipeCountAtLastBuild: overrides.swipeCountAtLastBuild ?? 0,
  };
}

describe("LOGIC-15 / API-35: phaseFor — profile existence is the discovery exit gate", () => {
  it("returns 'discovery' for a null profile (any swipe count)", () => {
    expect(phaseFor(null, 0)).toBe("discovery");
    expect(phaseFor(null, 100)).toBe("discovery");
  });

  it("returns 'personalized' for a non-null profile with no artists", () => {
    expect(phaseFor(profile({ genres: [], artists: [] }), 20)).toBe("personalized");
  });

  it("returns 'personalized' for a profile with < 8 strong-signal artists", () => {
    expect(
      phaseFor(
        profile({
          artists: [
            { name: "A1", score: STRONG_ARTIST_SCORE_THRESHOLD + 0.1 },
            { name: "A2", score: STRONG_ARTIST_SCORE_THRESHOLD + 0.1 },
          ],
        }),
        50,
      ),
    ).toBe("personalized");
  });

  it("returns 'personalized' for a profile with ≥ 8 strong-signal artists", () => {
    const strongArtists = Array.from({ length: 8 }, (_, i) => ({
      name: `A${i}`,
      score: 0.9,
    }));
    expect(phaseFor(profile({ artists: strongArtists }), 100)).toBe("personalized");
  });

  it("never returns 'artist-refinement' (API-35)", () => {
    const profiles = [
      profile({ artists: [] }),
      profile({ artists: [{ name: "A", score: 0.9 }] }),
      profile({
        artists: Array.from({ length: 7 }, (_, i) => ({ name: `A${i}`, score: 0.9 })),
      }),
      profile({
        artists: Array.from({ length: 8 }, (_, i) => ({ name: `A${i}`, score: 0.9 })),
      }),
    ];
    for (const p of profiles) {
      expect(phaseFor(p, 30)).not.toBe("artist-refinement");
    }
  });

  it("is deterministic — repeated calls with identical args produce identical output", () => {
    const p = profile({
      genres: [{ name: "house", score: 0.9 }],
      artists: [{ name: "A1", score: 0.9 }],
    });
    for (let i = 0; i < 50; i++) {
      expect(phaseFor(p, 30)).toBe("personalized");
    }
  });
});
