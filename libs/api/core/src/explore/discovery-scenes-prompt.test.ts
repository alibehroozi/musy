// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-45, LOGIC-46, LOGIC-47, AI-17.

import { describe, it, expect } from "vitest";
import {
  buildDiscoveryScenesPrompt,
  parseDiscoveryScenesResponse,
  DISCOVERY_SCENES_COUNT,
} from "./discovery-scenes-prompt.js";

const VICTIM_USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const VICTIM_EMAIL = "victim@example.com";
const VICTIM_IP = "203.0.113.99";
const VICTIM_SESSION = "sess_eyJ_must_not_appear";

// --- LOGIC-45 + LOGIC-46 + AI-17 ---

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

  it("system prompt asks for exactly DISCOVERY_SCENES_COUNT scenes", () => {
    const { system } = buildDiscoveryScenesPrompt();
    expect(system).toContain(`Exactly ${DISCOVERY_SCENES_COUNT} scenes`);
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

describe("AI-17: buildDiscoveryScenesPrompt never leaks identity into the prompt body", () => {
  it("zero-arg call carries no identity bytes (userId, email, IP, session)", () => {
    const out = buildDiscoveryScenesPrompt();
    const all = `${out.system}\n${out.userMessage}`;
    for (const identity of [VICTIM_USER_ID, VICTIM_EMAIL, VICTIM_IP, VICTIM_SESSION]) {
      expect(all).not.toContain(identity);
    }
  });

  it("soft-signal call carries no identity bytes", () => {
    const out = buildDiscoveryScenesPrompt({
      recentSwipes: [
        { title: "Some Song", artist: "Some Artist", direction: "right" },
        { title: "Another", artist: "Other", direction: "left" },
      ],
    });
    const all = `${out.system}\n${out.userMessage}`;
    for (const identity of [VICTIM_USER_ID, VICTIM_EMAIL, VICTIM_IP, VICTIM_SESSION]) {
      expect(all).not.toContain(identity);
    }
  });

  it("two callers with different identity contexts but identical recentSwipes produce identical prompts", () => {
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

  it("recentSwipes items only contribute {title, artist, direction} to the prompt", () => {
    const extraFields = {
      title: "Secret Song",
      artist: "Secret Artist",
      direction: "right" as const,
      // Extra field that should NOT appear in the prompt
      userId: VICTIM_USER_ID,
    };
    const out = buildDiscoveryScenesPrompt({ recentSwipes: [extraFields] });
    const all = `${out.system}\n${out.userMessage}`;
    expect(all).toContain("Secret Song");
    expect(all).toContain("Secret Artist");
    expect(all).not.toContain(VICTIM_USER_ID);
  });
});

// --- LOGIC-47 ---

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

  it("never throws on any input", () => {
    const inputs = [
      "",
      "null",
      "undefined",
      "{}",
      '{"scenes": null}',
      '{"scenes": "not-an-array"}',
      "not json at all",
      "```json\n{bad json}\n```",
    ];
    for (const input of inputs) {
      expect(() => parseDiscoveryScenesResponse(input)).not.toThrow();
    }
  });
});
