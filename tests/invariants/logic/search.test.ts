// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-*.

import { describe, it, expect } from "vitest";
import { dedupeAndMerge, withTimeout, LEVENSHTEIN_THRESHOLD } from "@moc/api-core";
import type { TrackResult, SearchResult } from "@moc/contracts";

function makeTrack(overrides: Partial<TrackResult> = {}): TrackResult {
  return {
    type: "track",
    id: overrides.id ?? "track:test-1",
    title: overrides.title ?? "Test Track",
    artist: overrides.artist ?? "Test Artist",
    provider: overrides.provider ?? "deezer",
    providerId: overrides.providerId ?? "1",
    sources: overrides.sources ?? ["deezer"],
    ...(overrides.isrc !== undefined ? { isrc: overrides.isrc } : {}),
    ...(overrides.album !== undefined ? { album: overrides.album } : {}),
    ...(overrides.duration !== undefined ? { duration: overrides.duration } : {}),
  };
}

describe("LOGIC-01: The search aggregator's dedupe + merge function is deterministic", () => {
  it("same provider results produce identical output on repeated calls", () => {
    const input: SearchResult[] = [
      makeTrack({ id: "deezer:1", title: "Harder Better Faster Stronger", artist: "Daft Punk" }),
      makeTrack({
        id: "audius:2",
        title: "Harder Better Faster Stronger",
        artist: "Daft Punk",
        provider: "audius",
        sources: ["audius"],
      }),
    ];
    const first = dedupeAndMerge(input);
    const second = dedupeAndMerge(input);
    expect(first).toEqual(second);
  });

  it("output order is stable given the same input order", () => {
    const input: SearchResult[] = [
      makeTrack({ id: "deezer:1", title: "Track A", artist: "Artist A" }),
      makeTrack({
        id: "audius:2",
        title: "Track B",
        artist: "Artist B",
        provider: "audius",
        sources: ["audius"],
      }),
    ];
    const out1 = dedupeAndMerge(input);
    const out2 = dedupeAndMerge(input);
    expect(out1.map((r) => r.id)).toEqual(out2.map((r) => r.id));
  });
});

describe("LOGIC-02: withTimeout resolves within timeout + 100ms even when the wrapped promise never settles", () => {
  it("a promise that never resolves causes withTimeout to reject after the given timeout", async () => {
    const neverResolves = new Promise<never>(() => undefined);
    await expect(withTimeout(neverResolves, 50)).rejects.toThrow(/timed out/i);
  });

  it("rejection happens within timeout + 100ms", async () => {
    const timeoutMs = 50;
    const start = Date.now();
    try {
      await withTimeout(new Promise<never>(() => undefined), timeoutMs);
    } catch {
      // expected
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(timeoutMs + 100);
  });
});

describe("LOGIC-03: Dedupe collapses matching results into a single result preserving all source providers", () => {
  it("two results with the same ISRC collapse to one result with both providers in sources", () => {
    const input: SearchResult[] = [
      makeTrack({ id: "deezer:1", isrc: "USRC12345678", provider: "deezer", sources: ["deezer"] }),
      makeTrack({ id: "audius:2", isrc: "USRC12345678", provider: "audius", sources: ["audius"] }),
    ];
    const out = dedupeAndMerge(input);
    expect(out).toHaveLength(1);
    expect(out[0]?.sources).toContain("deezer");
    expect(out[0]?.sources).toContain("audius");
  });

  it(`two results with title+artist within Levenshtein distance ${LEVENSHTEIN_THRESHOLD} collapse to one`, () => {
    const input: SearchResult[] = [
      makeTrack({ id: "deezer:1", title: "Lose Yourself", artist: "Eminem", sources: ["deezer"] }),
      makeTrack({
        id: "genius:2",
        title: "Lose Yourself",
        artist: "Eminem",
        provider: "genius",
        sources: ["genius"],
      }),
    ];
    const out = dedupeAndMerge(input);
    expect(out).toHaveLength(1);
    expect(out[0]?.sources).toContain("deezer");
    expect(out[0]?.sources).toContain("genius");
  });

  it("two results with different ISRC and dissimilar title+artist stay separate", () => {
    const input: SearchResult[] = [
      makeTrack({
        id: "deezer:1",
        isrc: "USRC11111111",
        title: "Track Alpha",
        artist: "Artist Alpha",
        sources: ["deezer"],
      }),
      makeTrack({
        id: "audius:2",
        isrc: "USRC99999999",
        title: "Track Zeta",
        artist: "Artist Zeta",
        provider: "audius",
        sources: ["audius"],
      }),
    ];
    const out = dedupeAndMerge(input);
    expect(out).toHaveLength(2);
  });

  it("deduplicated result sources list contains every contributing provider exactly once", () => {
    const input: SearchResult[] = [
      makeTrack({ id: "deezer:1", isrc: "SAME0000001", provider: "deezer", sources: ["deezer"] }),
      makeTrack({
        id: "audius:2",
        isrc: "SAME0000001",
        provider: "audius",
        sources: ["audius"],
      }),
      makeTrack({
        id: "genius:3",
        isrc: "SAME0000001",
        provider: "genius",
        sources: ["genius"],
      }),
    ];
    const out = dedupeAndMerge(input);
    expect(out).toHaveLength(1);
    const sources = out[0]?.sources ?? [];
    expect(new Set(sources).size).toBe(sources.length);
    expect(sources).toContain("deezer");
    expect(sources).toContain("audius");
    expect(sources).toContain("genius");
  });
});

import { applyInterestEvent, songKeyOf, INTEREST_SCORE_BY_EVENT } from "@moc/api-core";

describe("LOGIC: applyInterestEvent enforces the max-rule (DATA-06 helper)", () => {
  it("first explored event yields score 3 with scoreChanged=true", () => {
    const r = applyInterestEvent(null, "explored");
    expect(r).toEqual({ score: 3, scoreChanged: true });
  });

  it("first saved event yields score 8 with scoreChanged=true", () => {
    const r = applyInterestEvent(null, "saved");
    expect(r).toEqual({ score: 8, scoreChanged: true });
  });

  it("explored after saved keeps score at 8 with scoreChanged=false", () => {
    const r = applyInterestEvent(8, "explored");
    expect(r).toEqual({ score: 8, scoreChanged: false });
  });

  it("saved after explored raises score to 8 with scoreChanged=true", () => {
    const r = applyInterestEvent(3, "saved");
    expect(r).toEqual({ score: 8, scoreChanged: true });
  });

  it("re-saving stays at 8 with scoreChanged=false (idempotent)", () => {
    const r = applyInterestEvent(8, "saved");
    expect(r).toEqual({ score: 8, scoreChanged: false });
  });

  it("event scores are 3 (explored) and 8 (saved), per the product spec", () => {
    expect(INTEREST_SCORE_BY_EVENT.explored).toBe(3);
    expect(INTEREST_SCORE_BY_EVENT.saved).toBe(8);
  });
});

describe("LOGIC: songKeyOf composes a stable per-(source, externalId) key", () => {
  it("formats as `${source}:${externalId}`", () => {
    expect(songKeyOf("audius", "abc123")).toBe("audius:abc123");
    expect(songKeyOf("radio-browser", "station-uuid")).toBe("radio-browser:station-uuid");
  });
});

describe("LOGIC-13: SoundCloud search-hit normalizer is deterministic and stamps provider/sources", () => {
  it.todo("the same raw search hit always normalizes to the same TrackResult (or null)");
  it.todo(
    "non-null normalized results carry provider === 'soundcloud' and sources === ['soundcloud']",
  );
  it.todo("inputs missing required fields (id, title, permalink) normalize to null");
});
