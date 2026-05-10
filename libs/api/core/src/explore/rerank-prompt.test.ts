import { describe, it, expect } from "vitest";
import {
  buildRerankPrompt,
  MAX_RERANK_CANDIDATES,
  MAX_PROFILE_SUMMARY_BYTES,
  type PromptCandidate,
} from "./rerank-prompt.js";

function candidate(i: number): PromptCandidate {
  return {
    title: `Track ${i}`,
    artist: `Artist ${i}`,
    source: i % 2 === 0 ? "soundcloud" : "audius",
  };
}

describe("buildRerankPrompt", () => {
  it("returns the cached SYSTEM_PROMPT and a JSON userMessage carrying { candidatePool, profileSummary }", () => {
    const out = buildRerankPrompt({
      candidatePool: [candidate(1), candidate(2)],
      profileSummary: "you like deep house",
    });
    const parsed = JSON.parse(out.userMessage);
    expect(parsed.candidatePool).toHaveLength(2);
    expect(parsed.profileSummary).toBe("you like deep house");
    expect(out.system).toContain("music recommendation reranker");
  });

  it("only (title, artist, source) from each candidate reaches the user message", () => {
    const dirty = {
      ...candidate(1),
      coverUrl: "https://cdn.example.test/cover.jpg",
      userId: "alice-uuid",
      ipAddress: "203.0.113.7",
    } as unknown as PromptCandidate;
    const out = buildRerankPrompt({
      candidatePool: [dirty],
      profileSummary: "summary",
    });
    expect(out.userMessage).not.toContain("coverUrl");
    expect(out.userMessage).not.toContain("userId");
    expect(out.userMessage).not.toContain("ipAddress");
    expect(out.userMessage).not.toContain("alice-uuid");
    expect(out.userMessage).not.toContain("203.0.113.7");
  });

  it("is deterministic — equal inputs produce byte-identical (system, userMessage)", () => {
    const input = {
      candidatePool: [candidate(1), candidate(2), candidate(3)],
      profileSummary: "summary",
    };
    const a = buildRerankPrompt(input);
    const b = buildRerankPrompt({ ...input });
    expect(a.system).toBe(b.system);
    expect(a.userMessage).toBe(b.userMessage);
  });

  it("caps candidatePool at MAX_RERANK_CANDIDATES and drops oldest entries", () => {
    const candidates = Array.from({ length: MAX_RERANK_CANDIDATES + 30 }, (_, i) => candidate(i));
    const out = buildRerankPrompt({ candidatePool: candidates, profileSummary: "" });
    const parsed = JSON.parse(out.userMessage);
    expect(parsed.candidatePool).toHaveLength(MAX_RERANK_CANDIDATES);
    expect(parsed.candidatePool[0].title).toBe(candidate(0).title);
    expect(
      parsed.candidatePool.find(
        (c: PromptCandidate) => c.title === `Track ${MAX_RERANK_CANDIDATES}`,
      ),
    ).toBeUndefined();
  });

  it("truncates profileSummary to MAX_PROFILE_SUMMARY_BYTES without throwing", () => {
    const oversized = "a".repeat(MAX_PROFILE_SUMMARY_BYTES + 1024);
    expect(() => buildRerankPrompt({ candidatePool: [], profileSummary: oversized })).not.toThrow();
    const out = buildRerankPrompt({ candidatePool: [], profileSummary: oversized });
    const parsed = JSON.parse(out.userMessage);
    expect(Buffer.byteLength(parsed.profileSummary, "utf8")).toBeLessThanOrEqual(
      MAX_PROFILE_SUMMARY_BYTES,
    );
  });
});
