// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-14, LOGIC-15, LOGIC-16, LOGIC-18.

import { describe, it, expect, vi } from "vitest";
import type { SongSnapshot, TasteProfile, TrackResult } from "@moc/contracts";
import {
  bumpScore,
  classifyByListenCount,
  COMMON_THRESHOLD,
  NICHE_THRESHOLD,
  phaseFor,
  resolveCoversForQueue,
  type CoverLookup,
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

describe("LOGIC-15: phaseFor — profile existence is the discovery exit gate", () => {
  it("null profile → 'discovery' (any swipe count)", () => {
    expect(phaseFor(null, 0)).toBe("discovery");
    expect(phaseFor(null, 999)).toBe("discovery");
  });

  it("non-null profile with no liked genres → 'artist-refinement' (profile-existence gate)", () => {
    // Under the weakened LOGIC-15: any non-null profile with < 8 strong
    // artists is artist-refinement, even with zero or weak genres. The
    // previous "≥ 3 distinct liked genres at score ≥ 0.2" requirement was
    // a deadlock — small cold-start samples rarely hit it.
    expect(phaseFor(profile({ genres: [], artists: [] }), 20)).toBe("artist-refinement");
  });

  it("profile with two liked genres → 'artist-refinement' (was 'discovery' under old rule)", () => {
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
    ).toBe("artist-refinement");
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

  it("profile with ≥ 8 strong-signal artists → 'personalized' (genres no longer gate)", () => {
    const strong = Array.from({ length: 8 }, (_, i) => ({ name: `A${i}`, score: 0.9 }));
    expect(phaseFor(profile({ artists: strong }), 100)).toBe("personalized");
  });

  it("equal inputs always produce the same output (no Date.now / I/O)", () => {
    const p = profile({
      genres: [{ name: "house", score: 0.9 }],
      artists: [{ name: "A1", score: 0.9 }],
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

describe("LOGIC-18: pure cover-resolution helper is deterministic and drops cover-less candidates", () => {
  const snap = (overrides: Partial<SongSnapshot>): SongSnapshot => ({
    title: overrides.title ?? "T",
    artist: overrides.artist ?? "A",
    kind: overrides.kind ?? "track",
    ...(overrides.coverUrl !== undefined ? { coverUrl: overrides.coverUrl } : {}),
  });

  const track = (
    title: string,
    artist: string,
    artworkUrl: string | undefined = undefined,
  ): TrackResult => ({
    type: "track",
    id: `${title}::${artist}`,
    title,
    artist,
    provider: "audius",
    providerId: "pid",
    sources: ["audius"],
    ...(artworkUrl !== undefined ? { artworkUrl } : {}),
  });

  it("preserves coverUrl on already-covered inputs (resolver not consulted for those entries)", () => {
    const lookup: CoverLookup = vi.fn(() => null);
    const input = [snap({ title: "X", artist: "Y", coverUrl: "https://cdn/x.jpg" })];
    const out = resolveCoversForQueue(input, lookup);
    expect(out).toEqual(input);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("attaches artworkUrl as coverUrl when the resolver returns a track with a non-empty artworkUrl", () => {
    const lookup: CoverLookup = (t, a) =>
      t === "X" && a === "Y" ? track("X", "Y", "https://cdn/found.jpg") : null;
    const out = resolveCoversForQueue([snap({ title: "X", artist: "Y" })], lookup);
    expect(out).toEqual([snap({ title: "X", artist: "Y", coverUrl: "https://cdn/found.jpg" })]);
  });

  it("drops a cover-less input when the resolver returns null", () => {
    const lookup: CoverLookup = () => null;
    const out = resolveCoversForQueue([snap({ title: "X", artist: "Y" })], lookup);
    expect(out).toEqual([]);
  });

  it("drops a cover-less input when the resolver returns a track without artworkUrl (undefined or empty string)", () => {
    const noArt: CoverLookup = () => track("X", "Y");
    const emptyArt: CoverLookup = () => track("X", "Y", "");
    expect(resolveCoversForQueue([snap({ title: "X", artist: "Y" })], noArt)).toEqual([]);
    expect(resolveCoversForQueue([snap({ title: "X", artist: "Y" })], emptyArt)).toEqual([]);
  });

  it("is deterministic: byte-identical outputs across two consecutive calls with the same inputs", () => {
    const lookup: CoverLookup = (t) => (t === "B" ? track("B", "B", "https://cdn/b.jpg") : null);
    const input = [
      snap({ title: "A", coverUrl: "https://cdn/a.jpg" }),
      snap({ title: "B" }),
      snap({ title: "C" }),
    ];
    const out1 = resolveCoversForQueue(input, lookup);
    const out2 = resolveCoversForQueue(input, lookup);
    expect(JSON.stringify(out2)).toBe(JSON.stringify(out1));
  });

  it("preserves the relative order of survivors", () => {
    const lookup: CoverLookup = (t) => {
      if (t === "C") return track("C", "C", "https://cdn/c.jpg");
      if (t === "E") return track("E", "E", "https://cdn/e.jpg");
      return null;
    };
    const input = [
      snap({ title: "A", coverUrl: "https://cdn/a.jpg" }),
      snap({ title: "B" }), // drops
      snap({ title: "C" }), // kept via resolver
      snap({ title: "D", coverUrl: "https://cdn/d.jpg" }),
      snap({ title: "E" }), // kept via resolver
    ];
    const out = resolveCoversForQueue(input, lookup);
    expect(out.map((s) => s.title)).toEqual(["A", "C", "D", "E"]);
  });
});
