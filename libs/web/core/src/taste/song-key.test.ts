// Unit tests for the songKey inverse — fully derived from the
// `songKey = ${source}:${externalId}` convention pinned in
// libs/api/core/src/search/interest-event.ts.

import { describe, it, expect } from "vitest";
import { splitSongKey } from "./song-key.js";

describe("splitSongKey", () => {
  it("splits a well-formed songKey on the first colon", () => {
    expect(splitSongKey("soundcloud:abc123")).toEqual({
      source: "soundcloud",
      externalId: "abc123",
    });
  });

  it("preserves colons in the externalId", () => {
    expect(splitSongKey("audius:foo:bar:baz")).toEqual({
      source: "audius",
      externalId: "foo:bar:baz",
    });
  });

  it("accepts every known provider", () => {
    expect(splitSongKey("audius:x")?.source).toBe("audius");
    expect(splitSongKey("deezer:x")?.source).toBe("deezer");
    expect(splitSongKey("radio-browser:x")?.source).toBe("radio-browser");
    expect(splitSongKey("genius:x")?.source).toBe("genius");
    expect(splitSongKey("soundcloud:x")?.source).toBe("soundcloud");
  });

  it("returns null on empty string", () => {
    expect(splitSongKey("")).toBeNull();
  });

  it("returns null when no colon is present", () => {
    expect(splitSongKey("soundcloudonly")).toBeNull();
  });

  it("returns null when the source is unknown", () => {
    expect(splitSongKey("spotify:track-123")).toBeNull();
  });

  it("returns null when the colon is leading or trailing", () => {
    expect(splitSongKey(":x")).toBeNull();
    expect(splitSongKey("soundcloud:")).toBeNull();
  });
});
