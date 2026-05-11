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

describe("LOGIC-15: phaseFor — profile existence is the discovery exit gate", () => {
  it("returns 'discovery' for a null profile (any swipe count)", () => {
    expect(phaseFor(null, 0)).toBe("discovery");
    expect(phaseFor(null, 100)).toBe("discovery");
  });

  it("returns 'artist-refinement' for a non-null profile with no liked genres at all", () => {
    // Per new LOGIC-15, profile-existence — not genre count — is the gate.
    // A profile with empty genres still graduates out of discovery.
    expect(phaseFor(profile({ genres: [], artists: [] }), 20)).toBe("artist-refinement");
  });

  it("returns 'artist-refinement' for a profile with one weak liked genre", () => {
    // Previously this would have stayed in 'discovery' (< 3 distinct liked
    // genres at score ≥ 0.2). Under the new rule, any profile that exists
    // and has < 8 strong-signal artists is 'artist-refinement'.
    expect(phaseFor(profile({ genres: [{ name: "house", score: 0.05 }] }), 20)).toBe(
      "artist-refinement",
    );
  });

  it("returns 'artist-refinement' for a profile with two liked genres (no longer 'discovery')", () => {
    expect(
      phaseFor(
        profile({
          genres: [
            { name: "house", score: 0.9 },
            { name: "techno", score: 0.9 },
          ],
        }),
        20,
      ),
    ).toBe("artist-refinement");
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

  it("returns 'personalized' with ≥ 8 strong-signal artists (genres no longer gate)", () => {
    const strongArtists = Array.from({ length: 8 }, (_, i) => ({
      name: `A${i}`,
      score: 0.9,
    }));
    expect(phaseFor(profile({ artists: strongArtists }), 100)).toBe("personalized");
  });

  it("is deterministic — repeated calls with identical args produce identical output", () => {
    const p = profile({
      genres: [{ name: "house", score: 0.9 }],
      artists: [{ name: "A1", score: 0.9 }],
    });
    for (let i = 0; i < 50; i++) {
      expect(phaseFor(p, 30)).toBe("artist-refinement");
    }
  });
});
