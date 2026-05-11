// If a test fails, fix the source code, not the test.
//
// Pins LOGIC-20: parseColdStartResponse tolerates the wrappers LLMs
// add around JSON output. Reproduced empirically against Haiku: every
// observed cold-start response was wrapped in ```json … ``` fences
// regardless of the "no code fences" instruction in the prompt.

import { describe, it, expect } from "vitest";
import { parseColdStartResponse } from "./cold-start-prompt.js";

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
