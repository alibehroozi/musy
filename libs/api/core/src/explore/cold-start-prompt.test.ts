// If a test fails, fix the source code, not the test.
//
// Pins LOGIC-20 (parseColdStartResponse JSON wrapper tolerance) and
// LOGIC-28 (buildColdStartPrompt accepts optional `recentSwipes` soft
// signal; byte-identical to the legacy zero-arg form when omitted).

import { describe, it, expect } from "vitest";
import { buildColdStartPrompt, parseColdStartResponse } from "./cold-start-prompt.js";

const BARE_JSON = `{"songs":[{"title":"Blinding Lights","artist":"The Weeknd"},{"title":"Marquee Moon","artist":"Television"}]}`;

describe("LOGIC-20: parseColdStartResponse tolerates LLM JSON wrappers", () => {
  it("parses bare JSON (existing happy path)", () => {
    const out = parseColdStartResponse(BARE_JSON);
    expect(out).toEqual([
      { title: "Blinding Lights", artist: "The Weeknd" },
      { title: "Marquee Moon", artist: "Television" },
    ]);
  });

  it("parses JSON wrapped in ```json … ``` fences (the actual Haiku output shape)", () => {
    const fenced = "```json\n" + BARE_JSON + "\n```";
    const out = parseColdStartResponse(fenced);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ title: "Blinding Lights", artist: "The Weeknd" });
  });

  it("parses JSON wrapped in plain ``` … ``` fences (no language tag)", () => {
    const fenced = "```\n" + BARE_JSON + "\n```";
    const out = parseColdStartResponse(fenced);
    expect(out).toHaveLength(2);
  });

  it("parses JSON preceded by prose preamble", () => {
    const withPrefix = `Here is the JSON you requested:\n\n${BARE_JSON}`;
    const out = parseColdStartResponse(withPrefix);
    expect(out).toHaveLength(2);
  });

  it("parses JSON followed by prose postamble", () => {
    const withSuffix = `${BARE_JSON}\n\nLet me know if you'd like adjustments.`;
    const out = parseColdStartResponse(withSuffix);
    expect(out).toHaveLength(2);
  });

  it("parses JSON wrapped in both fences AND prose", () => {
    const wrapped =
      "Sure! Here's the diverse song list:\n\n```json\n" +
      BARE_JSON +
      "\n```\n\nHope these help spark exploration!";
    const out = parseColdStartResponse(wrapped);
    expect(out).toHaveLength(2);
  });

  it("handles a real-world multi-line pretty-printed object inside fences", () => {
    const pretty = `\`\`\`json
{
  "songs": [
    {"title": "Blinding Lights", "artist": "The Weeknd"},
    {"title": "Bohemian Rhapsody", "artist": "Queen"},
    {"title": "Creep", "artist": "Radiohead"}
  ]
}
\`\`\``;
    const out = parseColdStartResponse(pretty);
    expect(out).toHaveLength(3);
    expect(out.map((s) => s.title)).toEqual(["Blinding Lights", "Bohemian Rhapsody", "Creep"]);
  });

  it("ignores text containing nested braces inside string values (does not get confused by `{` inside a title)", () => {
    const tricky = `\`\`\`json
{"songs":[{"title":"Sample {fragment}","artist":"Demo"},{"title":"Plain","artist":"Other"}]}
\`\`\``;
    const out = parseColdStartResponse(tricky);
    expect(out).toEqual([
      { title: "Sample {fragment}", artist: "Demo" },
      { title: "Plain", artist: "Other" },
    ]);
  });

  it("handles escaped quotes inside string values without truncating the object", () => {
    const tricky = `{"songs":[{"title":"She said \\"hi\\"","artist":"Demo"}]}`;
    const out = parseColdStartResponse(tricky);
    expect(out).toEqual([{ title: 'She said "hi"', artist: "Demo" }]);
  });

  it("returns [] for empty / null-ish inputs (does not throw)", () => {
    expect(parseColdStartResponse("")).toEqual([]);
    expect(parseColdStartResponse("   ")).toEqual([]);
    expect(parseColdStartResponse("just prose, no json here")).toEqual([]);
  });

  it("returns [] for JSON that doesn't contain a `songs` array (does not throw)", () => {
    expect(parseColdStartResponse(`{"hello":"world"}`)).toEqual([]);
    expect(parseColdStartResponse(`{"songs":"not an array"}`)).toEqual([]);
  });

  it("returns [] when only the FIRST balanced object lacks `songs` — the parser does not scan for a later candidate (deterministic / total)", () => {
    // If the model emitted `{ "preamble": "..." } { "songs": [...] }` we
    // intentionally only look at the first object so the contract stays
    // simple and predictable.
    const out = parseColdStartResponse(`{"preamble":"hi"} ${BARE_JSON}`);
    expect(out).toEqual([]);
  });

  it("filters out malformed song entries but keeps the well-formed ones", () => {
    const mixed = `\`\`\`json
{"songs":[
  {"title":"OK","artist":"Yes"},
  {"title":42,"artist":"BadTitle"},
  {"artist":"NoTitle"},
  {"title":"AlsoOK","artist":"Sure"}
]}
\`\`\``;
    const out = parseColdStartResponse(mixed);
    expect(out).toEqual([
      { title: "OK", artist: "Yes" },
      { title: "AlsoOK", artist: "Sure" },
    ]);
  });

  it("is deterministic — same input always produces the same output", () => {
    const fenced = "```json\n" + BARE_JSON + "\n```";
    const a = parseColdStartResponse(fenced);
    const b = parseColdStartResponse(fenced);
    expect(a).toEqual(b);
  });
});

describe("LOGIC-28: buildColdStartPrompt accepts optional recentSwipes soft signal", () => {
  it("zero-arg call produces a non-empty (system, userMessage) pair", () => {
    const out = buildColdStartPrompt();
    expect(out.system.length).toBeGreaterThan(0);
    expect(out.userMessage.length).toBeGreaterThan(0);
  });

  it("zero-arg, empty-object, and empty-array forms produce byte-identical output (legacy cache-key compat)", () => {
    const legacy = buildColdStartPrompt();
    const withEmptyInput = buildColdStartPrompt({});
    const withEmptyArray = buildColdStartPrompt({ recentSwipes: [] });
    expect(withEmptyInput.system).toBe(legacy.system);
    expect(withEmptyInput.userMessage).toBe(legacy.userMessage);
    expect(withEmptyArray.system).toBe(legacy.system);
    expect(withEmptyArray.userMessage).toBe(legacy.userMessage);
  });

  it("non-empty recentSwipes adds soft-signal text to the system prompt", () => {
    const out = buildColdStartPrompt({
      recentSwipes: [
        { title: "Hate This", artist: "Disliked Band", direction: "left" },
        { title: "Loved It", artist: "Liked Band", direction: "right" },
      ],
    });
    const legacy = buildColdStartPrompt();
    expect(out.system).not.toBe(legacy.system);
    // The soft-signal text must mention BOTH directions so the model
    // knows to lean both ways, and must NOT be phrased as a forbid.
    expect(out.system.toLowerCase()).toContain("right");
    expect(out.system.toLowerCase()).toContain("left");
    expect(out.system.toLowerCase()).not.toContain("do not suggest");
    expect(out.system.toLowerCase()).not.toContain("forbid");
    expect(out.system.toLowerCase()).not.toContain("never use");
  });

  it("non-empty recentSwipes embeds the projected swipes in the user message", () => {
    const out = buildColdStartPrompt({
      recentSwipes: [
        { title: "Hate This", artist: "Disliked Band", direction: "left" },
        { title: "Loved It", artist: "Liked Band", direction: "right" },
      ],
    });
    expect(out.userMessage).toContain("Hate This");
    expect(out.userMessage).toContain("Loved It");
    expect(out.userMessage).toContain("right");
    expect(out.userMessage).toContain("left");
  });

  it("each projected swipe entry contains only {title, artist, direction}", () => {
    const out = buildColdStartPrompt({
      recentSwipes: [
        { title: "Song A", artist: "Artist A", direction: "right" },
        { title: "Song B", artist: "Artist B", direction: "left" },
      ],
    });
    // Parse the JSON portion of the user message and check shape.
    const match = /(\{[\s\S]*\})/.exec(out.userMessage);
    expect(match).toBeTruthy();
    const parsed = JSON.parse(match![1]!) as {
      recentSwipes: Array<Record<string, unknown>>;
    };
    for (const entry of parsed.recentSwipes) {
      expect(Object.keys(entry).sort()).toEqual(["artist", "direction", "title"]);
    }
  });

  it("is deterministic — equal recentSwipes produce byte-identical output", () => {
    const input = {
      recentSwipes: [
        { title: "Song A", artist: "Artist A", direction: "right" as const },
        { title: "Song B", artist: "Artist B", direction: "left" as const },
      ],
    };
    const a = buildColdStartPrompt(input);
    const b = buildColdStartPrompt({
      recentSwipes: [...input.recentSwipes],
    });
    expect(a.system).toBe(b.system);
    expect(a.userMessage).toBe(b.userMessage);
  });

  it("truncates recentSwipes newest-first to the documented cap (50 entries)", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({
      title: `T${i}`,
      artist: `A${i}`,
      direction: (i % 2 === 0 ? "right" : "left") as "right" | "left",
    }));
    const out = buildColdStartPrompt({ recentSwipes: many });
    // T0..T49 should make it; T50..T79 should be truncated (newest-first means caller passes newest at index 0).
    expect(out.userMessage).toContain("T0");
    expect(out.userMessage).toContain("T49");
    expect(out.userMessage).not.toContain("T70");
  });
});
