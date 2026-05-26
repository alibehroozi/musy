// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-45, LOGIC-46, LOGIC-47.
// These tests are for the invariant-level properties; lower-level unit tests
// live in libs/api/core/src/explore/discovery-scenes-prompt.test.ts.

import { describe, it, expect } from "vitest";
import { buildDiscoveryScenesPrompt, parseDiscoveryScenesResponse } from "@moc/api-core";

describe("LOGIC-45: buildDiscoveryScenesPrompt is pure and deterministic", () => {
  it("equal inputs produce byte-identical (system, userMessage) pairs", () => {
    const input = {
      recentSwipes: [
        { title: "Song A", artist: "Artist A", direction: "right" as const },
        { title: "Song B", artist: "Artist B", direction: "left" as const },
      ],
    };
    const a = buildDiscoveryScenesPrompt(input);
    const b = buildDiscoveryScenesPrompt({ recentSwipes: [...input.recentSwipes] });
    expect(a.system).toBe(b.system);
    expect(a.userMessage).toBe(b.userMessage);
  });

  it("empty recentSwipes and omitted argument produce byte-identical output", () => {
    const withEmpty = buildDiscoveryScenesPrompt({ recentSwipes: [] });
    const withOmit = buildDiscoveryScenesPrompt();
    expect(withEmpty.system).toBe(withOmit.system);
    expect(withEmpty.userMessage).toBe(withOmit.userMessage);
  });

  it("100 repeated calls with the same non-empty input produce identical output each time", () => {
    const input = {
      recentSwipes: [{ title: "Song A", artist: "Artist A", direction: "right" as const }],
    };
    const first = buildDiscoveryScenesPrompt(input);
    for (let i = 0; i < 100; i++) {
      const out = buildDiscoveryScenesPrompt(input);
      expect(out.system).toBe(first.system);
      expect(out.userMessage).toBe(first.userMessage);
    }
  });

  it("the helper never throws on any input", () => {
    expect(() => buildDiscoveryScenesPrompt()).not.toThrow();
    expect(() => buildDiscoveryScenesPrompt({})).not.toThrow();
    expect(() => buildDiscoveryScenesPrompt({ recentSwipes: [] })).not.toThrow();
    expect(() =>
      buildDiscoveryScenesPrompt({
        recentSwipes: [{ title: "T", artist: "A", direction: "right" }],
      }),
    ).not.toThrow();
  });
});

describe("LOGIC-46: buildDiscoveryScenesPrompt empty-swipes path is the cache anchor", () => {
  it("buildDiscoveryScenesPrompt() and buildDiscoveryScenesPrompt({ recentSwipes: [] }) are byte-identical", () => {
    const a = buildDiscoveryScenesPrompt();
    const b = buildDiscoveryScenesPrompt({ recentSwipes: [] });
    expect(a.system).toBe(b.system);
    expect(a.userMessage).toBe(b.userMessage);
  });

  it("the no-argument call is byte-identical to explicit empty-array call", () => {
    const noArg = buildDiscoveryScenesPrompt();
    const emptyArr = buildDiscoveryScenesPrompt({ recentSwipes: [] });
    expect(noArg.system).toBe(emptyArr.system);
    expect(noArg.userMessage).toBe(emptyArr.userMessage);
  });
});

describe("LOGIC-47: parseDiscoveryScenesResponse tolerates bad input and never throws", () => {
  it("returns { scenes: [] } on empty string input", () => {
    expect(parseDiscoveryScenesResponse("")).toEqual({ scenes: [] });
  });

  it("returns { scenes: [] } when input contains no JSON object", () => {
    expect(parseDiscoveryScenesResponse("no json here at all")).toEqual({ scenes: [] });
    expect(parseDiscoveryScenesResponse("```\nsome text\n```")).toEqual({ scenes: [] });
  });

  it("extracts scenes array from valid JSON response", () => {
    const text = JSON.stringify({
      scenes: [
        "early 2000s french touch house",
        "dreamy slow shoegaze",
        "90s NYC underground hip-hop",
      ],
    });
    const result = parseDiscoveryScenesResponse(text);
    expect(result.scenes).toHaveLength(3);
    expect(result.scenes[0]).toBe("early 2000s french touch house");
  });

  it("tolerates markdown code fences wrapping the JSON", () => {
    const text = [
      "```json",
      JSON.stringify({ scenes: ["ambient techno", "jazz fusion"] }),
      "```",
    ].join("\n");
    const result = parseDiscoveryScenesResponse(text);
    expect(result.scenes).toHaveLength(2);
    expect(result.scenes).toContain("ambient techno");
  });

  it("returns { scenes: [] } when JSON has no scenes key", () => {
    expect(parseDiscoveryScenesResponse(JSON.stringify({ songs: ["X", "Y"] }))).toEqual({
      scenes: [],
    });
  });

  it("filters out non-string scene elements rather than throwing", () => {
    const text = JSON.stringify({ scenes: ["valid", 42, null, "also valid", true] });
    const result = parseDiscoveryScenesResponse(text);
    expect(result.scenes).toEqual(["valid", "also valid"]);
  });
});
