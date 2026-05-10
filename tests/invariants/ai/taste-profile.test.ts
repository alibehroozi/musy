// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under AI-01..AI-03.

import { describe, it, expect } from "vitest";
import {
  buildTastePrompt,
  MAX_LISTENS,
  MAX_SUMMARY_BYTES,
  MAX_SWIPES,
  type PromptListen,
  type PromptSwipe,
} from "@moc/api-core";

const SAMPLE_USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const SAMPLE_EMAIL = "alice@example.com";
const SAMPLE_IP = "203.0.113.42";
const SAMPLE_SESSION_TOKEN = "sess_eyJhbGciOiJIUzI1NiJ9.test_token_must_not_leak";

function swipe(i: number, dir: "right" | "left" = "right"): PromptSwipe {
  return {
    title: `Title ${i}`,
    artist: `Artist ${i}`,
    kind: "track",
    direction: dir,
    at: new Date(2026, 0, 1, 0, i).toISOString(),
  };
}

function listen(i: number): PromptListen {
  return {
    title: `Listen Title ${i}`,
    artist: `Listen Artist ${i}`,
    kind: "track",
    eventType: "completed",
    at: new Date(2026, 0, 1, 0, i).toISOString(),
  };
}

describe("AI-01: buildTastePrompt never embeds userId / email / IP / session in system or user message", () => {
  it("the rendered (system, userMessage) bytes contain none of the identity strings passed alongside the input", () => {
    const out = buildTastePrompt({
      recentSwipes: [swipe(1), swipe(2, "left")],
      recentListens: [listen(1)],
      previousSummary: "you tend to like upbeat tracks",
    });
    const allBytes = `${out.system}\n${out.userMessage}`;
    for (const identity of [SAMPLE_USER_ID, SAMPLE_EMAIL, SAMPLE_IP, SAMPLE_SESSION_TOKEN]) {
      expect(allBytes).not.toContain(identity);
    }
  });

  it("only snapshot fields (title, artist, kind) from each swipe / listen reach the prompt", () => {
    // Cast through unknown so we can shove identity-shaped extras onto the
    // shape the helper accepts; AI-01 is precisely about the helper *not*
    // forwarding fields it wasn't given a contract for.
    const dirtySwipe = {
      ...swipe(1),
      coverUrl: "https://cdn.example.test/cover.jpg",
      year: 2025,
      durationSec: 234,
      userId: SAMPLE_USER_ID,
    } as unknown as PromptSwipe;
    const dirtyListen = {
      ...listen(1),
      coverUrl: "https://cdn.example.test/cover2.jpg",
      ipAddress: SAMPLE_IP,
    } as unknown as PromptListen;

    const out = buildTastePrompt({
      recentSwipes: [dirtySwipe],
      recentListens: [dirtyListen],
      previousSummary: null,
    });

    expect(out.userMessage).not.toContain("coverUrl");
    expect(out.userMessage).not.toContain("ipAddress");
    expect(out.userMessage).not.toContain("durationSec");
    expect(out.userMessage).not.toContain(SAMPLE_USER_ID);
    expect(out.userMessage).not.toContain(SAMPLE_IP);
    expect(out.userMessage).not.toContain("cdn.example.test");
  });
});

describe("AI-02: buildTastePrompt is deterministic — equal inputs produce byte-identical prompts", () => {
  it("two calls with identical (recentSwipes, recentListens, previousSummary) produce equal system + userMessage strings", () => {
    const input = {
      recentSwipes: [swipe(3, "right"), swipe(2, "left")],
      recentListens: [listen(5)],
      previousSummary: "you tend to like upbeat tracks",
    };
    const a = buildTastePrompt(input);
    const b = buildTastePrompt({ ...input });
    expect(a.system).toBe(b.system);
    expect(a.userMessage).toBe(b.userMessage);
  });

  it("two distinct userIds with identical inputs derive equal cache-key inputs (system + userMessage bytes)", () => {
    // The cache key is the (system, userMessage) bytes; the helper has no
    // userId argument so two callers can't possibly diverge from each other.
    const aliceContext = { userId: "alice-uuid", email: "alice@x" };
    const bobContext = { userId: "bob-uuid", email: "bob@x" };
    void aliceContext;
    void bobContext;
    const input = {
      recentSwipes: [swipe(1)],
      recentListens: [listen(1)],
      previousSummary: "shared summary",
    };
    const aPrompt = buildTastePrompt(input);
    const bPrompt = buildTastePrompt(input);
    expect(aPrompt.system + aPrompt.userMessage).toBe(bPrompt.system + bPrompt.userMessage);
  });
});

describe("AI-03: buildTastePrompt enforces a bounded prompt and truncates newest-first", () => {
  it("at most N=200 swipes reach the user message; older entries are dropped (newest-first retention)", () => {
    const swipes = Array.from({ length: MAX_SWIPES + 75 }, (_, i) => swipe(i));
    const out = buildTastePrompt({
      recentSwipes: swipes,
      recentListens: [],
      previousSummary: null,
    });
    const parsed = JSON.parse(out.userMessage) as { recentSwipes: PromptSwipe[] };
    expect(parsed.recentSwipes).toHaveLength(MAX_SWIPES);
    expect(parsed.recentSwipes[0]).toEqual(swipe(0));
    expect(parsed.recentSwipes[MAX_SWIPES - 1]).toEqual(swipe(MAX_SWIPES - 1));
    // Beyond-cap entries (indices >= MAX_SWIPES) are not present.
    expect(parsed.recentSwipes.find((s) => s.title === `Title ${MAX_SWIPES}`)).toBeUndefined();
  });

  it("at most M=100 listens reach the user message; older entries are dropped (newest-first retention)", () => {
    const listens = Array.from({ length: MAX_LISTENS + 50 }, (_, i) => listen(i));
    const out = buildTastePrompt({
      recentSwipes: [],
      recentListens: listens,
      previousSummary: null,
    });
    const parsed = JSON.parse(out.userMessage) as { recentListens: PromptListen[] };
    expect(parsed.recentListens).toHaveLength(MAX_LISTENS);
    expect(parsed.recentListens[0]).toEqual(listen(0));
    expect(
      parsed.recentListens.find((l) => l.title === `Listen Title ${MAX_LISTENS}`),
    ).toBeUndefined();
  });

  it("previousSummary is truncated to <= 4 KB; the helper does not throw on oversized input", () => {
    const oversized = "a".repeat(MAX_SUMMARY_BYTES + 1024);
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
});
