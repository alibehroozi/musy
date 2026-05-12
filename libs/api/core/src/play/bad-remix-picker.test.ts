import { describe, it, expect } from "vitest";
import {
  pickHighestPlaybackUntried,
  sortByPlaybackCountDesc,
  type SoundCloudCandidate,
} from "./bad-remix-picker.js";

function c(id: string, playbackCount: number): SoundCloudCandidate {
  return {
    id,
    title: id,
    artist: "anyone",
    durationSec: 200,
    permalink: `https://soundcloud.com/u/${id}`,
    playbackCount,
  };
}

describe("pickHighestPlaybackUntried", () => {
  it("returns null on empty input", () => {
    expect(pickHighestPlaybackUntried([], new Set())).toBeNull();
  });

  it("returns the single candidate when only one and not excluded", () => {
    expect(pickHighestPlaybackUntried([c("a", 100)], new Set())?.id).toBe("a");
  });

  it("returns null when every candidate is excluded", () => {
    expect(pickHighestPlaybackUntried([c("a", 100), c("b", 50)], new Set(["a", "b"]))).toBeNull();
  });

  it("picks the candidate with the strictly highest playbackCount", () => {
    expect(pickHighestPlaybackUntried([c("a", 10), c("b", 500), c("c", 50)], new Set())?.id).toBe(
      "b",
    );
  });

  it("skips excluded candidates even if they have the highest playbackCount", () => {
    expect(
      pickHighestPlaybackUntried([c("a", 10), c("b", 500), c("c", 50)], new Set(["b"]))?.id,
    ).toBe("c");
  });

  it("breaks ties on playbackCount lexicographically by id (deterministic)", () => {
    expect(pickHighestPlaybackUntried([c("zeta", 100), c("alpha", 100)], new Set())?.id).toBe(
      "alpha",
    );
  });

  it("is deterministic across input order", () => {
    const a = pickHighestPlaybackUntried([c("x", 100), c("y", 100), c("z", 100)], new Set());
    const b = pickHighestPlaybackUntried([c("z", 100), c("y", 100), c("x", 100)], new Set());
    expect(a?.id).toBe(b?.id);
    expect(a?.id).toBe("x");
  });
});

describe("sortByPlaybackCountDesc", () => {
  it("returns a new array without mutating the input", () => {
    const input = [c("a", 1), c("b", 2)];
    const out = sortByPlaybackCountDesc(input);
    expect(out).not.toBe(input);
    expect(input.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("sorts by playbackCount descending", () => {
    const out = sortByPlaybackCountDesc([c("a", 1), c("b", 100), c("c", 10)]);
    expect(out.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("breaks ties lexicographically by id", () => {
    const out = sortByPlaybackCountDesc([c("zeta", 50), c("alpha", 50), c("mike", 50)]);
    expect(out.map((x) => x.id)).toEqual(["alpha", "mike", "zeta"]);
  });
});
