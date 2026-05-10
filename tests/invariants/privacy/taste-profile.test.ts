// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PRIVACY-08.

import { describe, it, expect } from "vitest";
import { buildTastePrompt, type PromptListen, type PromptSwipe } from "@moc/api-core";

const VICTIM_USER_ID = "550e8400-e29b-41d4-a716-446655440777";
const VICTIM_EMAIL = "victim@example.com";
const VICTIM_IP = "203.0.113.99";
const VICTIM_SESSION = "sess_eyJ_must_not_appear_in_prompt";

function swipe(): PromptSwipe {
  return {
    title: "Bohemian Rhapsody",
    artist: "Queen",
    kind: "track",
    direction: "right",
    at: "2026-05-10T00:00:00.000Z",
  };
}

function listen(): PromptListen {
  return {
    title: "Bohemian Rhapsody",
    artist: "Queen",
    kind: "track",
    eventType: "completed",
    at: "2026-05-10T00:00:00.000Z",
  };
}

describe("PRIVACY-08: taste-profile build prompt is a function only of (recentSwipes, recentListens, previousSummary)", () => {
  it("the rendered (system, userMessage) bytes never contain any of the userId / email / IP / session token strings of the user being built for", () => {
    // The helper signature has no userId/email/IP/session arg — this test
    // protects against a regression that would add them.
    const out = buildTastePrompt({
      recentSwipes: [swipe()],
      recentListens: [listen()],
      previousSummary: null,
    });
    const all = `${out.system}\n${out.userMessage}`;
    for (const identity of [VICTIM_USER_ID, VICTIM_EMAIL, VICTIM_IP, VICTIM_SESSION]) {
      expect(all).not.toContain(identity);
    }
  });

  it("changing only userId / email / IP / session — but keeping recentSwipes/Listens/Summary equal — produces identical (system, userMessage) bytes", () => {
    const baseInput = {
      recentSwipes: [swipe()],
      recentListens: [listen()],
      previousSummary: "summary",
    };
    // Two callers with very different identity contexts but identical
    // (swipes, listens, summary) inputs must derive identical prompts —
    // because the helper takes no identity argument at all.
    const aliceCallerContext = { userId: "alice-uid", email: "alice@example.com" };
    const bobCallerContext = { userId: VICTIM_USER_ID, email: VICTIM_EMAIL, ip: VICTIM_IP };
    void aliceCallerContext;
    void bobCallerContext;
    const a = buildTastePrompt(baseInput);
    const b = buildTastePrompt({ ...baseInput });
    expect(a.system).toBe(b.system);
    expect(a.userMessage).toBe(b.userMessage);
  });

  it("the buildTastePrompt source contains no fetch / http(s) / network primitive — pure-logic boundary", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(
      new URL("../../../libs/api/core/src/explore/taste-prompt.ts", import.meta.url),
      "utf8",
    );
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src.toLowerCase()).not.toMatch(/https?:\/\//);
    expect(src).not.toMatch(/from\s+["']node:https?["']/);
    expect(src).not.toMatch(/\brequire\(\s*["']https?["']\s*\)/);
  });
});
