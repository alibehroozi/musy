import { describe, it, expect } from "vitest";
import {
  buildTastePrompt,
  MAX_LISTENS,
  MAX_SUMMARY_BYTES,
  MAX_SWIPES,
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
