import { describe, it, expect } from "vitest";
import {
  buildTastePrompt,
  MAX_LISTENS,
  MAX_SUMMARY_BYTES,
  MAX_SWIPES,
  parseTasteProfileResponse,
  type PromptListen,
  type PromptSwipe,
} from "./taste-prompt.js";

function swipe(i: number, dir: "right" | "left" = "right"): PromptSwipe {
  return {
    title: `Title ${i}`,
    artist: `Artist ${i}`,
    kind: "track",
    direction: dir,
    at: new Date(2026, 0, 1, 0, i).toISOString(),
  };
}

function listen(i: number, et: "started" | "completed" = "completed"): PromptListen {
  return {
    title: `Listen Title ${i}`,
    artist: `Listen Artist ${i}`,
    kind: "track",
    eventType: et,
    at: new Date(2026, 0, 1, 0, i).toISOString(),
  };
}

describe("buildTastePrompt — pure prompt builder for the taste-profile pipeline", () => {
  it("returns a (system, userMessage) pair with userMessage as JSON-encoded inputs", () => {
    const out = buildTastePrompt({
      recentSwipes: [swipe(1)],
      recentListens: [listen(1)],
      previousSummary: "you listen to a lot of dnb",
    });
    expect(typeof out.system).toBe("string");
    expect(out.system.length).toBeGreaterThan(0);
    const parsed = JSON.parse(out.userMessage);
    expect(parsed).toEqual({
      recentSwipes: [swipe(1)],
      recentListens: [listen(1)],
      previousSummary: "you listen to a lot of dnb",
    });
  });

  it("is deterministic — equal inputs produce byte-identical (system, userMessage)", () => {
    const input = {
      recentSwipes: [swipe(1), swipe(2, "left")],
      recentListens: [listen(1, "started")],
      previousSummary: "summary",
    };
    const a = buildTastePrompt(input);
    const b = buildTastePrompt({
      recentSwipes: [swipe(1), swipe(2, "left")],
      recentListens: [listen(1, "started")],
      previousSummary: "summary",
    });
    expect(a.system).toBe(b.system);
    expect(a.userMessage).toBe(b.userMessage);
  });

  it("caps swipes at MAX_SWIPES and keeps the newest entries (input is newest-first)", () => {
    const swipes = Array.from({ length: MAX_SWIPES + 50 }, (_, i) => swipe(i));
    const out = buildTastePrompt({
      recentSwipes: swipes,
      recentListens: [],
      previousSummary: null,
    });
    const parsed = JSON.parse(out.userMessage);
    expect(parsed.recentSwipes).toHaveLength(MAX_SWIPES);
    expect(parsed.recentSwipes[0]).toEqual(swipe(0));
    expect(parsed.recentSwipes[MAX_SWIPES - 1]).toEqual(swipe(MAX_SWIPES - 1));
  });

  it("caps listens at MAX_LISTENS and keeps the newest entries (input is newest-first)", () => {
    const listens = Array.from({ length: MAX_LISTENS + 50 }, (_, i) => listen(i));
    const out = buildTastePrompt({
      recentSwipes: [],
      recentListens: listens,
      previousSummary: null,
    });
    const parsed = JSON.parse(out.userMessage);
    expect(parsed.recentListens).toHaveLength(MAX_LISTENS);
    expect(parsed.recentListens[0]).toEqual(listen(0));
    expect(parsed.recentListens[MAX_LISTENS - 1]).toEqual(listen(MAX_LISTENS - 1));
  });

  it("truncates previousSummary to MAX_SUMMARY_BYTES bytes", () => {
    const oversized = "a".repeat(MAX_SUMMARY_BYTES + 500);
    expect(() =>
      buildTastePrompt({
        recentSwipes: [],
        recentListens: [],
        previousSummary: oversized,
      }),
    ).not.toThrow();
    const out = buildTastePrompt({
      recentSwipes: [],
      recentListens: [],
      previousSummary: oversized,
    });
    const parsed = JSON.parse(out.userMessage) as { previousSummary: string };
    expect(Buffer.byteLength(parsed.previousSummary, "utf8")).toBeLessThanOrEqual(
      MAX_SUMMARY_BYTES,
    );
  });

  it("only the projected snapshot fields (title, artist, kind) reach the prompt — extra fields are dropped", () => {
    const dirty = {
      ...swipe(1),
      // Cast to allow the test to pass extra fields the type doesn't carry.
    } as PromptSwipe & { coverUrl: string; userId: string };
    dirty.coverUrl = "https://example.test/x.jpg";
    dirty.userId = "550e8400-e29b-41d4-a716-446655440000";
    const out = buildTastePrompt({
      recentSwipes: [dirty],
      recentListens: [],
      previousSummary: null,
    });
    expect(out.userMessage).not.toContain("coverUrl");
    expect(out.userMessage).not.toContain("550e8400-e29b-41d4-a716-446655440000");
    expect(out.userMessage).not.toContain("example.test");
  });
});

// LOGIC-22: parseTasteProfileResponse tolerates the wrappers LLMs add
// around JSON output (markdown code fences, prose preamble/postamble),
// then validates the parsed object against TasteProfileLLMOutput. Unlike
// LOGIC-20/21 (which return [] on failure), this parser THROWS — the
// caller (profile-builder.service.ts) cannot proceed without a valid
// profile and already has a catch+log path.

const VALID_TASTE_PROFILE_JSON = JSON.stringify({
  genres: [
    { name: "house", score: 0.9 },
    { name: "techno", score: 0.7 },
  ],
  artists: [
    { name: "Aphex Twin", score: 0.85 },
    { name: "Four Tet", score: 0.6 },
  ],
  tempoBucket: "mid",
  remixPreference: "remix-friendly",
  summaryText: "You gravitate toward electronic with strong production craft.",
});

describe("LOGIC-22: parseTasteProfileResponse tolerates LLM JSON wrappers", () => {
  it("parses bare JSON (existing happy path)", () => {
    const out = parseTasteProfileResponse(VALID_TASTE_PROFILE_JSON);
    expect(out.summaryText).toMatch(/electronic/);
    expect(out.genres[0]).toEqual({ name: "house", score: 0.9 });
    expect(out.tempoBucket).toBe("mid");
    expect(out.remixPreference).toBe("remix-friendly");
  });

  it("parses JSON wrapped in ```json … ``` fences (the actual Haiku output shape)", () => {
    const fenced = "```json\n" + VALID_TASTE_PROFILE_JSON + "\n```";
    const out = parseTasteProfileResponse(fenced);
    expect(out.genres).toHaveLength(2);
    expect(out.artists).toHaveLength(2);
  });

  it("parses JSON wrapped in plain ``` … ``` fences (no language tag)", () => {
    const fenced = "```\n" + VALID_TASTE_PROFILE_JSON + "\n```";
    expect(parseTasteProfileResponse(fenced).summaryText.length).toBeGreaterThan(0);
  });

  it("parses JSON preceded by prose preamble", () => {
    const withPrefix = `Here's the taste profile:\n\n${VALID_TASTE_PROFILE_JSON}`;
    expect(parseTasteProfileResponse(withPrefix).tempoBucket).toBe("mid");
  });

  it("parses JSON followed by prose postamble", () => {
    const withSuffix = `${VALID_TASTE_PROFILE_JSON}\n\nLet me know if you'd like more detail.`;
    expect(parseTasteProfileResponse(withSuffix).artists[0]?.name).toBe("Aphex Twin");
  });

  it("parses JSON wrapped in both fences AND prose", () => {
    const wrapped =
      "Sure! Here's the profile:\n\n```json\n" +
      VALID_TASTE_PROFILE_JSON +
      "\n```\n\nWant me to rebuild from a different time window?";
    expect(parseTasteProfileResponse(wrapped).genres.length).toBeGreaterThan(0);
  });

  it("handles pretty-printed multi-line JSON inside fences", () => {
    const pretty = `\`\`\`json
{
  "genres": [
    {"name": "ambient", "score": 0.95},
    {"name": "drone", "score": 0.6}
  ],
  "artists": [
    {"name": "Brian Eno", "score": 0.9}
  ],
  "tempoBucket": "slow",
  "remixPreference": "original",
  "summaryText": "You prefer atmospheric work that prioritizes texture over hooks."
}
\`\`\``;
    const out = parseTasteProfileResponse(pretty);
    expect(out.genres[0]?.name).toBe("ambient");
    expect(out.tempoBucket).toBe("slow");
  });

  it("accepts null tempoBucket and null remixPreference per the schema", () => {
    const json = JSON.stringify({
      genres: [{ name: "g", score: 0.5 }],
      artists: [{ name: "a", score: 0.5 }],
      tempoBucket: null,
      remixPreference: null,
      summaryText: "neutral",
    });
    const fenced = "```json\n" + json + "\n```";
    const out = parseTasteProfileResponse(fenced);
    expect(out.tempoBucket).toBeNull();
    expect(out.remixPreference).toBeNull();
  });

  it("throws when input contains no JSON object", () => {
    expect(() => parseTasteProfileResponse("")).toThrow();
    expect(() => parseTasteProfileResponse("just prose, no json here")).toThrow();
    expect(() => parseTasteProfileResponse("   ")).toThrow();
  });

  it("throws when the embedded JSON is syntactically invalid", () => {
    expect(() => parseTasteProfileResponse("```json\n{ not really json\n```")).toThrow();
  });

  it("throws on schema mismatch (missing required field)", () => {
    const missingSummary = JSON.stringify({
      genres: [],
      artists: [],
      tempoBucket: null,
      remixPreference: null,
      // summaryText missing
    });
    expect(() => parseTasteProfileResponse(missingSummary)).toThrow();
  });

  it("accepts a long summaryText — the storage layer no longer caps length (DATA-11)", () => {
    const longSummary = JSON.stringify({
      genres: [],
      artists: [],
      tempoBucket: null,
      remixPreference: null,
      summaryText: "a".repeat(2000),
    });
    const out = parseTasteProfileResponse(longSummary);
    expect(out.summaryText.length).toBe(2000);
  });

  it("throws on schema mismatch (tempoBucket outside the allowed enum)", () => {
    const bad = JSON.stringify({
      genres: [],
      artists: [],
      tempoBucket: "lightspeed",
      remixPreference: null,
      summaryText: "x",
    });
    expect(() => parseTasteProfileResponse(bad)).toThrow();
  });

  it("is deterministic — same valid input always produces equivalent output", () => {
    const fenced = "```json\n" + VALID_TASTE_PROFILE_JSON + "\n```";
    const a = parseTasteProfileResponse(fenced);
    const b = parseTasteProfileResponse(fenced);
    expect(a).toEqual(b);
  });
});
