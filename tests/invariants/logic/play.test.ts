// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-05, LOGIC-06, LOGIC-07.

import { describe, it, expect } from "vitest";
import { computeSnapshotHash, extractSourceFromHtml } from "@moc/api-core";
import type { SongSnapshot } from "@moc/contracts";

function snap(overrides: Partial<SongSnapshot> = {}): SongSnapshot {
  return {
    title: overrides.title ?? "Get Lucky",
    artist: overrides.artist ?? "Daft Punk",
    kind: overrides.kind ?? "track",
    ...(overrides.durationSec !== undefined ? { durationSec: overrides.durationSec } : {}),
  };
}

describe("LOGIC-05: computeSnapshotHash is stable across whitespace and ASCII case in title and artist", () => {
  it("equal (title, artist, durationSec) tuples produce equal SHA-256 hashes", () => {
    const a = computeSnapshotHash(snap({ durationSec: 249 }));
    const b = computeSnapshotHash(snap({ durationSec: 249 }));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differing case in title or artist produces the same hash", () => {
    const a = computeSnapshotHash(snap({ title: "Get Lucky", artist: "Daft Punk" }));
    const b = computeSnapshotHash(snap({ title: "GET LUCKY", artist: "DAFT PUNK" }));
    expect(a).toBe(b);
  });

  it("leading/trailing whitespace in title or artist produces the same hash", () => {
    const a = computeSnapshotHash(snap({ title: "Get Lucky", artist: "Daft Punk" }));
    const b = computeSnapshotHash(snap({ title: "  Get Lucky\t", artist: "Daft Punk  " }));
    expect(a).toBe(b);
  });

  it("differing durationSec produces a different hash", () => {
    const a = computeSnapshotHash(snap({ durationSec: 249 }));
    const b = computeSnapshotHash(snap({ durationSec: 250 }));
    expect(a).not.toBe(b);
  });

  it("missing durationSec hashes consistently across calls", () => {
    const a = computeSnapshotHash(snap());
    const b = computeSnapshotHash(snap());
    expect(a).toBe(b);
    // And it differs from any non-undefined duration
    const c = computeSnapshotHash(snap({ durationSec: 0 }));
    expect(c).not.toBe(a);
  });
});

const HTML_WITH_TRACK = `<!doctype html>
<html><head>
<script>window.__sc_hydration = [{"hydratable":"sound","data":{"id":12345,"title":"x","media":{"transcodings":[{"url":"https://api-v2.soundcloud.com/media/soundcloud:tracks:12345/abc/stream/progressive","format":{"protocol":"progressive","mime_type":"audio/mpeg"}}]}}}];</script>
<script src="https://a-v2.sndcdn.com/assets/0-12345.js?...&client_id=AbCdEf0123456789abcd"></script>
</head></html>`;

const HTML_WITHOUT_HYDRATION = `<!doctype html><html><body>404</body></html>`;
const HTML_WITH_MALFORMED_HYDRATION = `<script>window.__sc_hydration = [not-json];</script>`;

describe("LOGIC-06: extractSourceFromHtml is deterministic given the same HTML input", () => {
  it("same HTML produces the same parsed result on repeated calls", () => {
    const a = extractSourceFromHtml(HTML_WITH_TRACK);
    const b = extractSourceFromHtml(HTML_WITH_TRACK);
    expect(a).toEqual(b);
    expect(a?.sourceTrackId).toBe("12345");
    expect(a?.clientId).toBe("AbCdEf0123456789abcd");
    expect(a?.transcodings).toHaveLength(1);
    expect(a?.transcodings[0]?.protocol).toBe("progressive");
  });

  it("HTML missing the embed JSON returns null", () => {
    expect(extractSourceFromHtml(HTML_WITHOUT_HYDRATION)).toBeNull();
  });

  it("malformed embed JSON returns null without throwing", () => {
    expect(() => extractSourceFromHtml(HTML_WITH_MALFORMED_HYDRATION)).not.toThrow();
    expect(extractSourceFromHtml(HTML_WITH_MALFORMED_HYDRATION)).toBeNull();
  });
});

describe("LOGIC-07: bumpScore is a deterministic max-rule keyed on play event type", () => {
  it.todo("bumpScore(0, 'started') returns 3");
  it.todo("bumpScore(0, 'completed') returns 5");
  it.todo("bumpScore(8, 'started') returns 8 (never decreases)");
  it.todo("bumpScore(8, 'completed') returns 8 (never decreases)");
  it.todo("bumpScore(3, 'completed') returns 5 (started → completed bumps up)");
  it.todo("bumpScore(5, 'started') returns 5 (completed before started keeps the higher score)");
});
