import { describe, it, expect } from "vitest";
import type { TasteProfile } from "@moc/contracts";
import {
  phaseFor,
  LIKED_GENRE_SCORE_THRESHOLD,
  STRONG_ARTIST_SCORE_THRESHOLD,
} from "./queue-phase.js";

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

describe("phaseFor", () => {
  it("returns 'discovery' for a null profile", () => {
    expect(phaseFor(null, 0)).toBe("discovery");
    expect(phaseFor(null, 100)).toBe("discovery");
  });

  it("returns 'discovery' when fewer than 3 distinct liked genres", () => {
    expect(
      phaseFor(
        profile({
          genres: [
            { name: "house", score: LIKED_GENRE_SCORE_THRESHOLD + 0.1 },
            { name: "techno", score: LIKED_GENRE_SCORE_THRESHOLD + 0.1 },
          ],
        }),
        20,
      ),
    ).toBe("discovery");
  });

  it("ignores below-threshold genre scores when counting liked genres", () => {
    expect(
      phaseFor(
        profile({
          genres: [
            { name: "house", score: 0.9 },
            { name: "techno", score: 0.9 },
            { name: "ambient", score: LIKED_GENRE_SCORE_THRESHOLD - 0.05 },
          ],
        }),
        50,
      ),
    ).toBe("discovery");
  });

  it("returns 'artist-refinement' with ≥ 3 liked genres but < 8 strong-signal artists", () => {
    expect(
      phaseFor(
        profile({
          genres: [
            { name: "house", score: 0.9 },
            { name: "techno", score: 0.9 },
            { name: "ambient", score: 0.5 },
          ],
          artists: [
            { name: "A1", score: STRONG_ARTIST_SCORE_THRESHOLD + 0.1 },
            { name: "A2", score: STRONG_ARTIST_SCORE_THRESHOLD + 0.1 },
          ],
        }),
        50,
      ),
    ).toBe("artist-refinement");
  });

  it("returns 'personalized' with ≥ 3 liked genres and ≥ 8 strong-signal artists", () => {
    const strongArtists = Array.from({ length: 8 }, (_, i) => ({
      name: `A${i}`,
      score: 0.9,
    }));
    expect(
      phaseFor(
        profile({
          genres: [
            { name: "house", score: 0.9 },
            { name: "techno", score: 0.9 },
            { name: "ambient", score: 0.5 },
          ],
          artists: strongArtists,
        }),
        100,
      ),
    ).toBe("personalized");
  });

  it("is deterministic — repeated calls with identical args produce identical output", () => {
    const p = profile({
      genres: [
        { name: "house", score: 0.9 },
        { name: "techno", score: 0.9 },
        { name: "ambient", score: 0.5 },
      ],
    });
    for (let i = 0; i < 50; i++) {
      expect(phaseFor(p, 30)).toBe("artist-refinement");
    }
  });
});
