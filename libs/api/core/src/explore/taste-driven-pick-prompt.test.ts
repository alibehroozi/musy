// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-51, LOGIC-52, AI-19.

import { describe, it, expect } from "vitest";
import type { TasteProfile } from "@moc/contracts";
import {
  buildTasteDrivenPickPrompt,
  parseTasteDrivenPickResponse,
  TASTE_DRIVEN_MAX_CANDIDATE_POOL,
  TASTE_DRIVEN_PICKS_TARGET,
  type TasteDrivenPromptCandidate,
  type TasteDrivenScoreBuckets,
} from "./taste-driven-pick-prompt.js";

const VICTIM_USER_ID = "550e8400-e29b-41d4-a716-446655440777";
const VICTIM_EMAIL = "victim@example.com";
const VICTIM_IP = "203.0.113.99";
const VICTIM_SESSION = "sess_eyJ_must_not_appear_in_prompt";
const VICTIM_SWIPE_HISTORY = "swiped_right_then_left";

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

function buckets(): TasteDrivenScoreBuckets {
  return {
    low: [{ title: "Forgotten", artist: "Random" }],
    mid: [{ title: "Middle Ground", artist: "Mediocre" }],
    high: [{ title: "Favourite", artist: "Beloved" }],
  };
}

function pool(count: number): TasteDrivenPromptCandidate[] {
  return Array.from({ length: count }, (_, i) => ({
    title: `Track ${i}`,
    artist: `Artist ${i}`,
    source: "soundcloud" as const,
  }));
}

describe("LOGIC-51: buildTasteDrivenPickPrompt is pure and deterministic", () => {
  it("returns both system and userMessage as non-empty strings", () => {
    const out = buildTasteDrivenPickPrompt({
      profile: profile(),
      scoreBuckets: buckets(),
      candidatePool: pool(5),
    });
    expect(typeof out.system).toBe("string");
    expect(typeof out.userMessage).toBe("string");
    expect(out.system.length).toBeGreaterThan(0);
    expect(out.userMessage.length).toBeGreaterThan(0);
  });

  it("equal inputs produce byte-identical (system, userMessage)", () => {
    const input = { profile: profile(), scoreBuckets: buckets(), candidatePool: pool(10) };
    const a = buildTasteDrivenPickPrompt(input);
    const b = buildTasteDrivenPickPrompt(input);
    expect(a.system).toBe(b.system);
    expect(a.userMessage).toBe(b.userMessage);
  });

  it(`system prompt instructs model to pick exactly ${TASTE_DRIVEN_PICKS_TARGET} tracks`, () => {
    const out = buildTasteDrivenPickPrompt({
      profile: profile(),
      scoreBuckets: buckets(),
      candidatePool: pool(5),
    });
    expect(out.system).toContain(String(TASTE_DRIVEN_PICKS_TARGET));
  });

  it("system prompt instructs at-most-2-per-artist cap", () => {
    const out = buildTasteDrivenPickPrompt({
      profile: profile(),
      scoreBuckets: buckets(),
      candidatePool: pool(5),
    });
    expect(out.system).toContain("2 track");
  });

  it(`truncates candidatePool to ${TASTE_DRIVEN_MAX_CANDIDATE_POOL} entries`, () => {
    const over = pool(TASTE_DRIVEN_MAX_CANDIDATE_POOL + 10);
    const out = buildTasteDrivenPickPrompt({
      profile: profile(),
      scoreBuckets: buckets(),
      candidatePool: over,
    });
    const payload = JSON.parse(out.userMessage) as { candidatePool: unknown[] };
    expect(payload.candidatePool.length).toBe(TASTE_DRIVEN_MAX_CANDIDATE_POOL);
  });
});

describe("LOGIC-52: parseTasteDrivenPickResponse tolerates markdown wrappers and returns {picks:[]} on failure", () => {
  it("parses bare JSON response", () => {
    const text = JSON.stringify({ picks: [{ title: "T", artist: "A" }] });
    const out = parseTasteDrivenPickResponse(text);
    expect(out.picks).toEqual([{ title: "T", artist: "A" }]);
  });

  it("parses JSON wrapped in markdown code fences", () => {
    const text = '```json\n{"picks":[{"title":"T","artist":"A"}]}\n```';
    const out = parseTasteDrivenPickResponse(text);
    expect(out.picks).toEqual([{ title: "T", artist: "A" }]);
  });

  it("returns {picks:[]} for unparseable input", () => {
    expect(parseTasteDrivenPickResponse("not json").picks).toEqual([]);
    expect(parseTasteDrivenPickResponse("").picks).toEqual([]);
  });

  it("returns {picks:[]} when picks key is missing", () => {
    const out = parseTasteDrivenPickResponse(JSON.stringify({ relatedArtists: ["A"] }));
    expect(out.picks).toEqual([]);
  });

  it("drops malformed entries inside the picks array silently", () => {
    const text = JSON.stringify({
      picks: [
        { title: "T1", artist: "A1" },
        { title: "T2" }, // missing artist
        null,
        { artist: "A3" }, // missing title
        { title: "T4", artist: "A4" },
      ],
    });
    const out = parseTasteDrivenPickResponse(text);
    expect(out.picks).toEqual([
      { title: "T1", artist: "A1" },
      { title: "T4", artist: "A4" },
    ]);
  });

  it("never throws on any input", () => {
    const inputs = ["", "null", "[]", "{}", JSON.stringify({ picks: "not-an-array" })];
    for (const input of inputs) {
      expect(() => parseTasteDrivenPickResponse(input)).not.toThrow();
    }
  });
});

describe("AI-19: buildTasteDrivenPickPrompt never leaks identity into the prompt body", () => {
  it("(system, userMessage) bytes never contain userId / email / IP / session / raw swipe history", () => {
    const out = buildTasteDrivenPickPrompt({
      profile: profile(),
      scoreBuckets: buckets(),
      candidatePool: pool(5),
    });
    const body = out.system + out.userMessage;
    expect(body).not.toContain(VICTIM_USER_ID);
    expect(body).not.toContain(VICTIM_EMAIL);
    expect(body).not.toContain(VICTIM_IP);
    expect(body).not.toContain(VICTIM_SESSION);
    expect(body).not.toContain(VICTIM_SWIPE_HISTORY);
  });

  it("score-bucket entries in the prompt body are {title, artist} only — no score values", () => {
    const out = buildTasteDrivenPickPrompt({
      profile: profile(),
      scoreBuckets: {
        low: [{ title: "L", artist: "La" }],
        mid: [{ title: "M", artist: "Ma" }],
        high: [{ title: "H", artist: "Ha" }],
      },
      candidatePool: pool(5),
    });
    const payload = JSON.parse(out.userMessage) as {
      scoreBuckets: {
        low: Array<Record<string, unknown>>;
        mid: Array<Record<string, unknown>>;
        high: Array<Record<string, unknown>>;
      };
    };
    const allEntries = [
      ...payload.scoreBuckets.low,
      ...payload.scoreBuckets.mid,
      ...payload.scoreBuckets.high,
    ];
    for (const entry of allEntries) {
      expect("score" in entry).toBe(false);
      expect(Object.keys(entry).sort()).toEqual(["artist", "title"]);
    }
  });

  it("lastBuiltAt and swipeCountAtLastBuild do not appear in the prompt body", () => {
    const p = profile({ lastBuiltAt: "2099-01-01T00:00:00.000Z", swipeCountAtLastBuild: 12345 });
    const out = buildTasteDrivenPickPrompt({
      profile: p,
      scoreBuckets: buckets(),
      candidatePool: pool(5),
    });
    const body = out.system + out.userMessage;
    expect(body).not.toContain("2099-01-01");
    expect(body).not.toContain("12345");
  });
});
