// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PRIVACY-10.

import { describe, it, expect } from "vitest";
import { buildArtistRefinementPrompt } from "@moc/api-core";
import type { TasteProfile } from "@moc/contracts";

const VICTIM_USER_ID = "550e8400-e29b-41d4-a716-446655440777";
const VICTIM_EMAIL = "victim@example.com";
const VICTIM_IP = "203.0.113.99";
const VICTIM_SESSION = "sess_eyJ_must_not_appear_in_prompt";
const VICTIM_SWIPE_HISTORY = "swiped_right_then_left";

function profile(): TasteProfile {
  return {
    userId: VICTIM_USER_ID,
    genres: [
      { name: "indie rock", score: 0.85 },
      { name: "synthwave", score: 0.6 },
    ],
    artists: [
      { name: "Tame Impala", score: 0.9 },
      { name: "Caribou", score: 0.7 },
    ],
    tempoBucket: "mid",
    remixPreference: "original",
    summaryText: "Likes dreamy psychedelic indie and 80s-inspired synths.",
    lastBuiltAt: "2026-05-10T00:00:00.000Z",
    swipeCountAtLastBuild: 25,
  };
}

describe("PRIVACY-10: explore-artist-refinement prompt projects only declared fields per input source", () => {
  it("the rendered prompt bytes never contain userId / email / IP / session / raw swipe directions", () => {
    const out = buildArtistRefinementPrompt({
      profile: profile(),
      candidatePool: [{ title: "T", artist: "A", source: "soundcloud" }],
    });
    const all = `${out.system}\n${out.userMessage}`;
    for (const identity of [
      VICTIM_USER_ID,
      VICTIM_EMAIL,
      VICTIM_IP,
      VICTIM_SESSION,
      VICTIM_SWIPE_HISTORY,
    ]) {
      expect(all).not.toContain(identity);
    }
  });

  it("the user-message JSON body's `profile` section contains exactly the projected keys (no userId, no lastBuiltAt, no swipeCountAtLastBuild)", () => {
    const out = buildArtistRefinementPrompt({
      profile: profile(),
      candidatePool: [{ title: "T", artist: "A", source: "soundcloud" }],
    });
    const parsed = JSON.parse(out.userMessage) as {
      profile: Record<string, unknown>;
    };
    const projectedKeys = Object.keys(parsed.profile).sort();
    expect(projectedKeys).toEqual(
      ["artists", "genres", "remixPreference", "summaryText", "tempoBucket"].sort(),
    );
  });

  it("candidate-pool entries contain only {title, artist, source} (no provider-internal fields, no IDs)", () => {
    const out = buildArtistRefinementPrompt({
      profile: profile(),
      candidatePool: [{ title: "T", artist: "A", source: "soundcloud" }],
    });
    const parsed = JSON.parse(out.userMessage) as {
      candidatePool: Array<Record<string, unknown>>;
    };
    for (const c of parsed.candidatePool) {
      expect(Object.keys(c).sort()).toEqual(["artist", "source", "title"]);
    }
  });

  it("no scoreBuckets section appears (the artist-refinement prompt does not carry the user's rated-history projections)", () => {
    const out = buildArtistRefinementPrompt({
      profile: profile(),
      candidatePool: [{ title: "T", artist: "A", source: "soundcloud" }],
    });
    expect(out.userMessage).not.toContain("scoreBuckets");
  });
});
