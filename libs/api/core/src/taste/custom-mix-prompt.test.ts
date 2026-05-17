// If a test fails, fix the source code, not the test.
//
// Pure-helper unit tests for buildCustomMixPrompt / parseCustomMixResponse.
// AI-14 / AI-15 / AI-16 + PRIVACY-15 cross-cutting tests live in
// tests/invariants/ai/custom-mix.test.ts.

import { describe, it, expect } from "vitest";
import {
  buildCustomMixPrompt,
  parseCustomMixResponse,
  type CustomMixPoolSong,
} from "./custom-mix-prompt.js";

function poolSong(i: number): CustomMixPoolSong {
  return {
    songKey: `snap:hash${i}`,
    title: `Title ${i}`,
    artist: `Artist ${i}`,
    kind: "track",
    generalScore: 50,
  };
}

describe("buildCustomMixPrompt — pure helper unit tests", () => {
  it("produces a deterministic (system, userMessage) pair", () => {
    const input = {
      promptText: "dreamy late-night focus",
      pool: [poolSong(1), poolSong(2)],
      buckets: [{ id: "b-1", name: "Late night drives", description: "Moody late tracks" }],
    };
    const a = buildCustomMixPrompt(input);
    const b = buildCustomMixPrompt({ ...input });
    expect(a.system).toBe(b.system);
    expect(a.userMessage).toBe(b.userMessage);
  });

  it("the user message JSON parses to { promptText, pool, buckets }", () => {
    const out = buildCustomMixPrompt({
      promptText: "rainy day jazz",
      pool: [poolSong(1)],
      buckets: [],
    });
    const parsed = JSON.parse(out.userMessage) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(["buckets", "pool", "promptText"]);
    expect(parsed["promptText"]).toBe("rainy day jazz");
  });

  it("only the projected per-song fields reach the prompt body", () => {
    const dirty = {
      ...poolSong(1),
      direction: "right",
      at: "2026-05-17T00:00:00.000Z",
      coverUrl: "https://cdn.example.test/cover.jpg",
      email: "alice@example.com",
    } as unknown as CustomMixPoolSong;
    const out = buildCustomMixPrompt({
      promptText: "moody",
      pool: [dirty],
      buckets: [],
    });
    expect(out.userMessage).not.toContain("direction");
    expect(out.userMessage).not.toContain("coverUrl");
    expect(out.userMessage).not.toContain("cdn.example.test");
    expect(out.userMessage).not.toContain("alice@example.com");
  });
});

describe("parseCustomMixResponse — tolerates LLM wrappers, validates against schema", () => {
  it("parses a bare JSON object with name/description/songs", () => {
    const text = JSON.stringify({
      name: "Dreamy late nights",
      description: "Soft tracks for after-hours focus",
      songs: [{ songKey: "snap:abc", initialScore: 72, sourceBuckets: ["b-1"] }],
    });
    const out = parseCustomMixResponse(text);
    expect(out.name).toBe("Dreamy late nights");
    expect(out.songs).toHaveLength(1);
    expect(out.songs[0]!.initialScore).toBe(72);
  });

  it("parses when wrapped in markdown code fences", () => {
    const inner = JSON.stringify({
      name: "X",
      description: "y",
      songs: [{ songKey: "snap:abc", initialScore: 50 }],
    });
    const text = "```json\n" + inner + "\n```";
    const out = parseCustomMixResponse(text);
    expect(out.songs).toHaveLength(1);
  });

  it("throws when no JSON object is found", () => {
    expect(() => parseCustomMixResponse("I cannot build that mix.")).toThrow();
  });

  it("throws when the JSON does not match CustomMixLLMOutput", () => {
    expect(() => parseCustomMixResponse(JSON.stringify({ wrong: "shape" }))).toThrow();
  });
});
