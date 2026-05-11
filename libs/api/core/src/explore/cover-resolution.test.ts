import { describe, it, expect, vi } from "vitest";
import type { SearchResult, SongSnapshot, TrackResult } from "@moc/contracts";

import { pickCoverMatch, resolveCoversForQueue, type CoverLookup } from "./cover-resolution.js";

function snap(overrides: Partial<SongSnapshot>): SongSnapshot {
  return {
    title: overrides.title ?? "T",
    artist: overrides.artist ?? "A",
    kind: overrides.kind ?? "track",
    ...(overrides.coverUrl !== undefined ? { coverUrl: overrides.coverUrl } : {}),
    ...(overrides.year !== undefined ? { year: overrides.year } : {}),
    ...(overrides.durationSec !== undefined ? { durationSec: overrides.durationSec } : {}),
  };
}

function track(
  overrides: Partial<TrackResult> & Pick<TrackResult, "title" | "artist">,
): TrackResult {
  return {
    type: "track",
    id: overrides.id ?? "id",
    title: overrides.title,
    artist: overrides.artist,
    provider: overrides.provider ?? "audius",
    providerId: overrides.providerId ?? "pid",
    sources: overrides.sources ?? ["audius"],
    ...(overrides.album !== undefined ? { album: overrides.album } : {}),
    ...(overrides.duration !== undefined ? { duration: overrides.duration } : {}),
    ...(overrides.artworkUrl !== undefined ? { artworkUrl: overrides.artworkUrl } : {}),
    ...(overrides.previewUrl !== undefined ? { previewUrl: overrides.previewUrl } : {}),
    ...(overrides.externalUrl !== undefined ? { externalUrl: overrides.externalUrl } : {}),
    ...(overrides.isrc !== undefined ? { isrc: overrides.isrc } : {}),
  };
}

describe("resolveCoversForQueue", () => {
  it("passes through a candidate that already has a non-empty coverUrl, leaving the lookup uncalled for it", () => {
    const lookup: CoverLookup = vi.fn(() => null);
    const input = [snap({ title: "X", artist: "Y", coverUrl: "https://cdn/x.jpg" })];
    const out = resolveCoversForQueue(input, lookup);
    expect(out).toEqual(input);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("attaches lookup.artworkUrl as coverUrl for a candidate without one", () => {
    const lookup: CoverLookup = (t, a) =>
      t === "X" && a === "Y"
        ? track({ title: "X", artist: "Y", artworkUrl: "https://cdn/found.jpg" })
        : null;
    const out = resolveCoversForQueue([snap({ title: "X", artist: "Y" })], lookup);
    expect(out).toEqual([snap({ title: "X", artist: "Y", coverUrl: "https://cdn/found.jpg" })]);
  });

  it("drops a candidate when the lookup returns null", () => {
    const lookup: CoverLookup = () => null;
    const out = resolveCoversForQueue([snap({ title: "X", artist: "Y" })], lookup);
    expect(out).toEqual([]);
  });

  it("drops a candidate when the lookup returns a TrackResult without artworkUrl", () => {
    const lookup: CoverLookup = () => track({ title: "X", artist: "Y" });
    const out = resolveCoversForQueue([snap({ title: "X", artist: "Y" })], lookup);
    expect(out).toEqual([]);
  });

  it("drops a candidate when the lookup returns a TrackResult with an empty artworkUrl string", () => {
    const lookup: CoverLookup = () => track({ title: "X", artist: "Y", artworkUrl: "" });
    const out = resolveCoversForQueue([snap({ title: "X", artist: "Y" })], lookup);
    expect(out).toEqual([]);
  });

  it("is deterministic: the same inputs produce byte-identical outputs across calls", () => {
    const lookup: CoverLookup = (t) =>
      t === "B" ? track({ title: "B", artist: "B", artworkUrl: "https://cdn/b.jpg" }) : null;
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
    const lookup: CoverLookup = (t) =>
      t === "C"
        ? track({ title: "C", artist: "C", artworkUrl: "https://cdn/c.jpg" })
        : t === "E"
          ? track({ title: "E", artist: "E", artworkUrl: "https://cdn/e.jpg" })
          : null;
    const input = [
      snap({ title: "A", coverUrl: "https://cdn/a.jpg" }),
      snap({ title: "B" }), // drops (lookup null)
      snap({ title: "C" }), // kept (lookup hit)
      snap({ title: "D", coverUrl: "https://cdn/d.jpg" }),
      snap({ title: "E" }), // kept (lookup hit)
    ];
    const out = resolveCoversForQueue(input, lookup);
    expect(out.map((s) => s.title)).toEqual(["A", "C", "D", "E"]);
  });

  it("does not mutate the input array or its items", () => {
    const lookup: CoverLookup = () =>
      track({ title: "X", artist: "Y", artworkUrl: "https://cdn/x.jpg" });
    const original = snap({ title: "X", artist: "Y" });
    const input = [original];
    resolveCoversForQueue(input, lookup);
    expect(input).toEqual([snap({ title: "X", artist: "Y" })]);
    expect(input[0]).toBe(original);
  });
});

describe("pickCoverMatch", () => {
  it("returns null when results is empty", () => {
    expect(pickCoverMatch("X", "Y", [])).toBeNull();
  });

  it("returns null when no results carry a non-empty artworkUrl", () => {
    const results: SearchResult[] = [track({ title: "X", artist: "Y" })];
    expect(pickCoverMatch("X", "Y", results)).toBeNull();
  });

  it("skips stations even when they have a favicon", () => {
    const results: SearchResult[] = [
      {
        type: "station",
        id: "s1",
        name: "Some Station",
        favicon: "https://cdn/fav.png",
        provider: "radio-browser",
        providerId: "rb-1",
        sources: ["radio-browser"],
      },
    ];
    expect(pickCoverMatch("X", "Y", results)).toBeNull();
  });

  it("returns the exact normalized title+artist match when available", () => {
    const a = track({ title: "OTHER", artist: "OTHER", artworkUrl: "https://cdn/a.jpg" });
    const b = track({
      title: "  hey JUDE ",
      artist: "  THE beatles ",
      artworkUrl: "https://cdn/b.jpg",
    });
    expect(pickCoverMatch("Hey Jude", "The Beatles", [a, b])).toEqual(b);
  });

  it("falls back to the first track with artwork when no exact match", () => {
    const a = track({ title: "X1", artist: "Y", artworkUrl: "https://cdn/a.jpg" });
    const b = track({ title: "X2", artist: "Y", artworkUrl: "https://cdn/b.jpg" });
    expect(pickCoverMatch("X", "Y", [a, b])).toEqual(a);
  });
});
