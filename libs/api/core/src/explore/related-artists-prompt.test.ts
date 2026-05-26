// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-48, LOGIC-49, LOGIC-50, AI-18, PRIVACY-17.

import { describe, it, expect } from "vitest";
import type { TasteProfile } from "@moc/contracts";
import {
  buildRelatedArtistsPrompt,
  parseRelatedArtistsResponse,
  RELATED_ARTISTS_HIGH_BUCKET_SAMPLE_CAP,
  type HighBucketSample,
  type BuildRelatedArtistsPromptInput,
} from "./related-artists-prompt.js";

const VICTIM_USER_ID = "550e8400-e29b-41d4-a716-446655440777";
const VICTIM_EMAIL = "victim@example.com";
const VICTIM_IP = "203.0.113.99";
const VICTIM_SESSION = "sess_eyJ_must_not_appear_in_prompt";

function profile(
  overrides: Partial<TasteProfile> & {
    genres?: TasteProfile["genres"];
    artists?: TasteProfile["artists"];
  } = {},
): TasteProfile {
  return {
    userId: VICTIM_USER_ID,
    genres: overrides.genres ?? [{ name: "indie rock", score: 0.85 }],
    artists: overrides.artists ?? [{ name: "Tame Impala", score: 0.9 }],
    tempoBucket: overrides.tempoBucket ?? "mid",
    remixPreference: overrides.remixPreference ?? "original",
    summaryText: overrides.summaryText ?? "Likes dreamy psychedelic indie.",
    lastBuiltAt: overrides.lastBuiltAt ?? "2026-05-10T00:00:00.000Z",
    swipeCountAtLastBuild: overrides.swipeCountAtLastBuild ?? 25,
  };
}

function samples(count: number): HighBucketSample[] {
  return Array.from({ length: count }, (_, i) => ({
    title: `Track ${i}`,
    artist: `Artist ${i}`,
  }));
}

function baseInput(): BuildRelatedArtistsPromptInput {
  return {
    profile: profile(),
    highBucketSamples: samples(5),
    shuffledSeedArtists: ["Tame Impala", "Beach House"],
  };
}

describe("LOGIC-48: buildRelatedArtistsPrompt is pure and deterministic", () => {
  it("returns both system and userMessage as non-empty strings", () => {
    const out = buildRelatedArtistsPrompt(baseInput());
    expect(typeof out.system).toBe("string");
    expect(typeof out.userMessage).toBe("string");
    expect(out.system.length).toBeGreaterThan(0);
    expect(out.userMessage.length).toBeGreaterThan(0);
  });

  it("equal inputs produce byte-identical (system, userMessage)", () => {
    const a = buildRelatedArtistsPrompt(baseInput());
    const b = buildRelatedArtistsPrompt(baseInput());
    expect(a.system).toBe(b.system);
    expect(a.userMessage).toBe(b.userMessage);
  });

  it("different shuffledSeedArtists produce different userMessage", () => {
    const input1 = { ...baseInput(), shuffledSeedArtists: ["Artist A", "Artist B"] };
    const input2 = { ...baseInput(), shuffledSeedArtists: ["Artist C", "Artist D"] };
    const a = buildRelatedArtistsPrompt(input1);
    const b = buildRelatedArtistsPrompt(input2);
    expect(a.userMessage).not.toBe(b.userMessage);
  });

  it("does not mutate input arrays", () => {
    const seedArtists = ["Tame Impala", "Beach House"];
    const hiSamples = samples(3);
    buildRelatedArtistsPrompt({
      profile: profile(),
      highBucketSamples: hiSamples,
      shuffledSeedArtists: seedArtists,
    });
    expect(seedArtists).toEqual(["Tame Impala", "Beach House"]);
    expect(hiSamples).toHaveLength(3);
  });
});

describe("LOGIC-49: buildRelatedArtistsPrompt accepts pre-shuffled shuffledSeedArtists (caller's responsibility)", () => {
  it("preserves the shuffledSeedArtists order in the user message body", () => {
    const ordered = ["Artist A", "Artist B", "Artist C"];
    const reversed = ["Artist C", "Artist B", "Artist A"];
    const outOrdered = buildRelatedArtistsPrompt({ ...baseInput(), shuffledSeedArtists: ordered });
    const outReversed = buildRelatedArtistsPrompt({
      ...baseInput(),
      shuffledSeedArtists: reversed,
    });
    const payloadOrdered = JSON.parse(outOrdered.userMessage) as { shuffledSeedArtists: string[] };
    const payloadReversed = JSON.parse(outReversed.userMessage) as {
      shuffledSeedArtists: string[];
    };
    expect(payloadOrdered.shuffledSeedArtists).toEqual(ordered);
    expect(payloadReversed.shuffledSeedArtists).toEqual(reversed);
    expect(outOrdered.userMessage).not.toBe(outReversed.userMessage);
  });
});

describe("LOGIC-50: parseRelatedArtistsResponse tolerates markdown wrappers and returns {relatedArtists:[]} on failure", () => {
  it("parses bare JSON response", () => {
    const text = JSON.stringify({ relatedArtists: ["Artist A", "Artist B"] });
    const out = parseRelatedArtistsResponse(text);
    expect(out.relatedArtists).toEqual(["Artist A", "Artist B"]);
  });

  it("parses JSON wrapped in markdown code fences", () => {
    const text = '```json\n{ "relatedArtists": ["Artist A"] }\n```';
    const out = parseRelatedArtistsResponse(text);
    expect(out.relatedArtists).toEqual(["Artist A"]);
  });

  it("returns {relatedArtists:[]} for unparseable input", () => {
    expect(parseRelatedArtistsResponse("not json at all").relatedArtists).toEqual([]);
    expect(parseRelatedArtistsResponse("").relatedArtists).toEqual([]);
  });

  it("returns {relatedArtists:[]} when relatedArtists key is missing", () => {
    const out = parseRelatedArtistsResponse(JSON.stringify({ picks: ["A"] }));
    expect(out.relatedArtists).toEqual([]);
  });

  it("drops non-string elements silently", () => {
    const text = JSON.stringify({ relatedArtists: ["Artist A", 42, null, "Artist B"] });
    const out = parseRelatedArtistsResponse(text);
    expect(out.relatedArtists).toEqual(["Artist A", "Artist B"]);
  });

  it("never throws on any input", () => {
    const inputs = [
      "",
      "null",
      "undefined",
      "[]",
      "{}",
      "{ relatedArtists: null }",
      JSON.stringify({ relatedArtists: "not-an-array" }),
    ];
    for (const input of inputs) {
      expect(() => parseRelatedArtistsResponse(input)).not.toThrow();
    }
  });
});

describe("AI-18: buildRelatedArtistsPrompt never leaks identity into the prompt body", () => {
  it("(system, userMessage) bytes never contain userId / email / IP / session", () => {
    const out = buildRelatedArtistsPrompt(baseInput());
    const body = out.system + out.userMessage;
    expect(body).not.toContain(VICTIM_USER_ID);
    expect(body).not.toContain(VICTIM_EMAIL);
    expect(body).not.toContain(VICTIM_IP);
    expect(body).not.toContain(VICTIM_SESSION);
  });

  it("highBucketSamples entries in the prompt body are {title, artist} only — no score values", () => {
    const hiSamples: HighBucketSample[] = [{ title: "Secret Song", artist: "Secret Artist" }];
    const out = buildRelatedArtistsPrompt({ ...baseInput(), highBucketSamples: hiSamples });
    const payload = JSON.parse(out.userMessage) as {
      highBucketSamples: Array<Record<string, unknown>>;
    };
    for (const entry of payload.highBucketSamples) {
      expect(Object.keys(entry).sort()).toEqual(["artist", "title"]);
    }
  });

  it("lastBuiltAt and swipeCountAtLastBuild do not appear in the prompt body", () => {
    const p = profile({ lastBuiltAt: "2099-01-01T00:00:00.000Z", swipeCountAtLastBuild: 12345 });
    const out = buildRelatedArtistsPrompt({ ...baseInput(), profile: p });
    const body = out.system + out.userMessage;
    expect(body).not.toContain("2099-01-01");
    expect(body).not.toContain("12345");
  });
});

describe("PRIVACY-17: highBucketSamples capped at 10 entries", () => {
  it(`caps at ${RELATED_ARTISTS_HIGH_BUCKET_SAMPLE_CAP} entries when more are provided`, () => {
    const over = samples(RELATED_ARTISTS_HIGH_BUCKET_SAMPLE_CAP + 5);
    const out = buildRelatedArtistsPrompt({ ...baseInput(), highBucketSamples: over });
    const payload = JSON.parse(out.userMessage) as { highBucketSamples: HighBucketSample[] };
    expect(payload.highBucketSamples.length).toBe(RELATED_ARTISTS_HIGH_BUCKET_SAMPLE_CAP);
  });

  it("preserves up to cap entries when fewer are provided", () => {
    const few = samples(3);
    const out = buildRelatedArtistsPrompt({ ...baseInput(), highBucketSamples: few });
    const payload = JSON.parse(out.userMessage) as { highBucketSamples: HighBucketSample[] };
    expect(payload.highBucketSamples.length).toBe(3);
  });

  it("each forwarded entry is {title, artist} only — no score field", () => {
    const out = buildRelatedArtistsPrompt(baseInput());
    const payload = JSON.parse(out.userMessage) as {
      highBucketSamples: Array<Record<string, unknown>>;
    };
    for (const entry of payload.highBucketSamples) {
      expect("score" in entry).toBe(false);
      expect("title" in entry).toBe(true);
      expect("artist" in entry).toBe(true);
    }
  });
});
