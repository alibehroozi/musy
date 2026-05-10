// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-14, LOGIC-15, LOGIC-16.

import { describe, it, expect } from "vitest";
import type { TasteProfile } from "@moc/contracts";
import {
  bumpScore,
  classifyByListenCount,
  COMMON_THRESHOLD,
  NICHE_THRESHOLD,
  phaseFor,
} from "@moc/api-core";

function profile(
  overrides: Partial<TasteProfile> & {
    genres?: TasteProfile["genres"];
    artists?: TasteProfile["artists"];
  } = {},
): TasteProfile {
  return {
    userId: "u",
    genres: overrides.genres ?? [],
    artists: overrides.artists ?? [],
    tempoBucket: overrides.tempoBucket ?? null,
    remixPreference: overrides.remixPreference ?? null,
    summaryText: overrides.summaryText ?? "",
    lastBuiltAt: overrides.lastBuiltAt ?? "2026-05-10T00:00:00.000Z",
    swipeCountAtLastBuild: overrides.swipeCountAtLastBuild ?? 0,
  };
}

describe("LOGIC-14: bumpScore extended for swipe events is deterministic and monotonic", () => {
  it("bumpScore(0, 'swiped_right') returns 8", () => {
    expect(bumpScore(0, "swiped_right")).toBe(8);
  });

  it("bumpScore(0, 'swiped_left') returns 0 (no-op — left-swipe doesn't move the score)", () => {
    expect(bumpScore(0, "swiped_left")).toBe(0);
  });

  it("bumpScore(8, 'swiped_right') returns 8 (never decreases)", () => {
    expect(bumpScore(8, "swiped_right")).toBe(8);
  });

  it("bumpScore(5, 'swiped_right') returns 8 (completed → swiped_right bumps up)", () => {
    expect(bumpScore(5, "swiped_right")).toBe(8);
  });

  it("bumpScore(8, 'swiped_left') returns 8 (left-swipe never decreases an existing score)", () => {
    expect(bumpScore(8, "swiped_left")).toBe(8);
  });

  it("bumpScore is deterministic — repeated calls with the same inputs yield the same output", () => {
    for (let i = 0; i < 50; i++) {
      expect(bumpScore(0, "swiped_right")).toBe(8);
      expect(bumpScore(8, "swiped_left")).toBe(8);
    }
  });
});

describe("LOGIC-15: phaseFor(profile, totalSwipeCount) is deterministic and total", () => {
  it("null profile → 'discovery'", () => {
    expect(phaseFor(null, 0)).toBe("discovery");
    expect(phaseFor(null, 999)).toBe("discovery");
  });

  it("profile with fewer than 3 distinct liked genres → 'discovery'", () => {
    expect(
      phaseFor(
        profile({
          genres: [
            { name: "house", score: 0.9 },
            { name: "techno", score: 0.9 },
          ],
        }),
        25,
      ),
    ).toBe("discovery");
  });

  it("profile with ≥ 3 liked genres but < 8 strong-signal artists → 'artist-refinement'", () => {
    expect(
      phaseFor(
        profile({
          genres: [
            { name: "house", score: 0.9 },
            { name: "techno", score: 0.9 },
            { name: "ambient", score: 0.5 },
          ],
          artists: [
            { name: "A1", score: 0.9 },
            { name: "A2", score: 0.9 },
          ],
        }),
        25,
      ),
    ).toBe("artist-refinement");
  });

  it("profile with ≥ 3 liked genres and ≥ 8 strong-signal artists → 'personalized'", () => {
    const strong = Array.from({ length: 8 }, (_, i) => ({ name: `A${i}`, score: 0.9 }));
    expect(
      phaseFor(
        profile({
          genres: [
            { name: "house", score: 0.9 },
            { name: "techno", score: 0.9 },
            { name: "ambient", score: 0.5 },
          ],
          artists: strong,
        }),
        100,
      ),
    ).toBe("personalized");
  });

  it("equal inputs always produce the same output (no Date.now / I/O)", () => {
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

describe("LOGIC-16: classifyByListenCount(listenCount) is deterministic", () => {
  it("null listenCount → 'niche'", () => {
    expect(classifyByListenCount(null)).toBe("niche");
    expect(classifyByListenCount(undefined)).toBe("niche");
  });

  it("listenCount below NICHE_THRESHOLD → 'niche'", () => {
    expect(classifyByListenCount(0)).toBe("niche");
    expect(classifyByListenCount(NICHE_THRESHOLD - 1)).toBe("niche");
  });

  it("listenCount in [NICHE_THRESHOLD, COMMON_THRESHOLD) → 'mid'", () => {
    expect(classifyByListenCount(NICHE_THRESHOLD)).toBe("mid");
    expect(classifyByListenCount(COMMON_THRESHOLD - 1)).toBe("mid");
  });

  it("listenCount at or above COMMON_THRESHOLD → 'common'", () => {
    expect(classifyByListenCount(COMMON_THRESHOLD)).toBe("common");
    expect(classifyByListenCount(COMMON_THRESHOLD * 5)).toBe("common");
  });
});
