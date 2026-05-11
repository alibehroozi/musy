// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PRIVACY-11.

import { describe, it, expect } from "vitest";
import { buildColdStartPrompt } from "@moc/api-core";

const VICTIM_USER_ID = "550e8400-e29b-41d4-a716-446655440777";
const VICTIM_EMAIL = "victim@example.com";
const VICTIM_IP = "203.0.113.99";
const VICTIM_SESSION = "sess_eyJ_must_not_appear_in_prompt";

describe("PRIVACY-11: explore-cold-start prompt projects only declared fields per input source", () => {
  it("legacy (zero-arg) call body contains no per-user data", () => {
    const out = buildColdStartPrompt();
    const all = `${out.system}\n${out.userMessage}`;
    for (const identity of [VICTIM_USER_ID, VICTIM_EMAIL, VICTIM_IP, VICTIM_SESSION]) {
      expect(all).not.toContain(identity);
    }
  });

  it("soft-signal call: each swipe entry contains only {title, artist, direction}", () => {
    const out = buildColdStartPrompt({
      recentSwipes: [
        { title: "Song A", artist: "Artist A", direction: "right" },
        { title: "Song B", artist: "Artist B", direction: "left" },
      ],
    });
    const match = /(\{[\s\S]*\})/.exec(out.userMessage);
    expect(match).toBeTruthy();
    const parsed = JSON.parse(match![1]!) as {
      recentSwipes: Array<Record<string, unknown>>;
    };
    for (const entry of parsed.recentSwipes) {
      expect(Object.keys(entry).sort()).toEqual(["artist", "direction", "title"]);
    }
  });

  it("soft-signal call: no swipe timestamps, no snapshotHash, no kind, no coverUrl, no userId reach the prompt body", () => {
    const out = buildColdStartPrompt({
      recentSwipes: [{ title: "Song A", artist: "Artist A", direction: "right" }],
    });
    expect(out.userMessage).not.toContain("snapshotHash");
    expect(out.userMessage).not.toContain("coverUrl");
    expect(out.userMessage).not.toContain("kind");
    expect(out.userMessage).not.toContain("userId");
    // ISO-8601 datetime marker we'd expect from a timestamp leak.
    expect(out.userMessage).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("identity bytes from caller context never appear in the soft-signal prompt", () => {
    const out = buildColdStartPrompt({
      recentSwipes: [{ title: "Song A", artist: "Artist A", direction: "right" }],
    });
    const all = `${out.system}\n${out.userMessage}`;
    for (const identity of [VICTIM_USER_ID, VICTIM_EMAIL, VICTIM_IP, VICTIM_SESSION]) {
      expect(all).not.toContain(identity);
    }
  });
});
