// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-05, LOGIC-06.

import { describe, it, expect } from "vitest";
import { extractSourceFromHtml } from "../../../libs/api/core/src/play/soundcloud-parser.js";
import { computeSnapshotHash } from "../../../libs/api/core/src/play/snapshot-hash.js";

const VALID_SC_HTML = `
<html><body>
<script>window.__sc_hydration = [{"hydratable":"track","data":{"id":123456,"title":"Test Track","user":{"name":"Test Artist"},"media":{"transcodings":[{"url":"https://api-v2.soundcloud.com/media/abc","format":{"protocol":"progressive","mime_type":"audio/mpeg"}}]},"client_id":"testclientid123"}}];</script>
</body></html>
`;

describe("LOGIC-05: extractSourceFromHtml is deterministic; returns null for malformed HTML", () => {
  it("returns the same result when called twice with identical HTML input", () => {
    const first = extractSourceFromHtml(VALID_SC_HTML);
    const second = extractSourceFromHtml(VALID_SC_HTML);
    expect(first).toEqual(second);
  });

  it("returns null for an empty string", () => {
    expect(extractSourceFromHtml("")).toBeNull();
  });

  it("returns null for HTML that contains no SoundCloud embed JSON", () => {
    expect(extractSourceFromHtml("<html><body><p>Hello</p></body></html>")).toBeNull();
  });

  it("returns a non-null result with sourceTrackId and clientId for valid SoundCloud embed HTML", () => {
    const result = extractSourceFromHtml(VALID_SC_HTML);
    expect(result).not.toBeNull();
    expect(result?.sourceTrackId).toBe("123456");
    expect(result?.clientId).toBe("testclientid123");
    expect(result?.transcodings.length).toBeGreaterThan(0);
  });
});

describe("LOGIC-06: computeSnapshotHash produces stable output regardless of whitespace or case", () => {
  it("same title/artist/durationSec always produces the same hash", () => {
    const h1 = computeSnapshotHash({ title: "Get Lucky", artist: "Daft Punk", durationSec: 249 });
    const h2 = computeSnapshotHash({ title: "Get Lucky", artist: "Daft Punk", durationSec: 249 });
    expect(h1).toBe(h2);
  });

  it("leading/trailing whitespace in title and artist is normalised before hashing", () => {
    const base = computeSnapshotHash({ title: "Get Lucky", artist: "Daft Punk" });
    const spaced = computeSnapshotHash({ title: "  Get Lucky  ", artist: "  Daft Punk  " });
    expect(base).toBe(spaced);
  });

  it("upper-case and lower-case variants of the same input produce the same hash", () => {
    const lower = computeSnapshotHash({ title: "get lucky", artist: "daft punk" });
    const upper = computeSnapshotHash({ title: "GET LUCKY", artist: "DAFT PUNK" });
    expect(lower).toBe(upper);
  });

  it("different inputs produce different hashes", () => {
    const h1 = computeSnapshotHash({ title: "Get Lucky", artist: "Daft Punk" });
    const h2 = computeSnapshotHash({ title: "Instant Crush", artist: "Daft Punk" });
    expect(h1).not.toBe(h2);
  });
});
