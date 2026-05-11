import { describe, it, expect } from "vitest";
import {
  buildRerankPrompt,
  MAX_RERANK_CANDIDATES,
  MAX_PROFILE_SUMMARY_BYTES,
  parseRerankResponse,
  type PromptCandidate,
  type RerankItem,
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

// LOGIC-21: parseRerankResponse tolerates the wrappers LLMs add around
// JSON output. Mirror of LOGIC-20's cold-start tolerance test set, but
// pinned to the rerank-specific `{ranked: [...]}` shape.

const BARE_RERANK_JSON =
  '{"ranked":[{"title":"A","artist":"X","source":"audius","score":0.9},{"title":"B","artist":"Y","source":"soundcloud","score":0.5}]}';

describe("LOGIC-21: parseRerankResponse tolerates LLM JSON wrappers", () => {
  it("parses bare JSON (the happy path inherited from the old inline helper)", () => {
    const out = parseRerankResponse(BARE_RERANK_JSON);
    expect(out).toEqual<RerankItem[]>([
      { title: "A", artist: "X", source: "audius", score: 0.9 },
      { title: "B", artist: "Y", source: "soundcloud", score: 0.5 },
    ]);
  });

  it("parses JSON wrapped in ```json … ``` fences (the actual Haiku output shape)", () => {
    const fenced = "```json\n" + BARE_RERANK_JSON + "\n```";
    const out = parseRerankResponse(fenced);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ title: "A", artist: "X", source: "audius", score: 0.9 });
  });

  it("parses JSON wrapped in plain ``` … ``` fences without a language tag", () => {
    const fenced = "```\n" + BARE_RERANK_JSON + "\n```";
    expect(parseRerankResponse(fenced)).toHaveLength(2);
  });

  it("parses JSON preceded by prose preamble", () => {
    const withPrefix = `Here is the rerank result:\n\n${BARE_RERANK_JSON}`;
    expect(parseRerankResponse(withPrefix)).toHaveLength(2);
  });

  it("parses JSON followed by prose postamble", () => {
    const withSuffix = `${BARE_RERANK_JSON}\n\nLet me know if you'd like adjustments.`;
    expect(parseRerankResponse(withSuffix)).toHaveLength(2);
  });

  it("parses JSON wrapped in both fences AND prose", () => {
    const wrapped =
      "Sure! Here's the ranking:\n\n```json\n" +
      BARE_RERANK_JSON +
      "\n```\n\nLet me know if you want me to re-rank with different signals.";
    expect(parseRerankResponse(wrapped)).toHaveLength(2);
  });

  it("handles pretty-printed multi-line JSON inside fences", () => {
    const pretty = `\`\`\`json
{
  "ranked": [
    {"title": "A", "artist": "X", "source": "audius", "score": 0.9},
    {"title": "B", "artist": "Y", "source": "soundcloud", "score": 0.7},
    {"title": "C", "artist": "Z", "source": "deezer", "score": 0.3}
  ]
}
\`\`\``;
    const out = parseRerankResponse(pretty);
    expect(out.map((i) => i.title)).toEqual(["A", "B", "C"]);
  });

  it("ignores braces inside string values (does not get confused by `{` inside a title)", () => {
    const tricky = `\`\`\`json
{"ranked":[{"title":"Sample {fragment}","artist":"Demo","source":"audius","score":0.5}]}
\`\`\``;
    const out = parseRerankResponse(tricky);
    expect(out).toEqual([
      { title: "Sample {fragment}", artist: "Demo", source: "audius", score: 0.5 },
    ]);
  });

  it("handles escaped quotes inside string values without truncating the object", () => {
    const tricky = `{"ranked":[{"title":"She said \\"hi\\"","artist":"Demo","source":"audius","score":0.4}]}`;
    expect(parseRerankResponse(tricky)).toEqual([
      { title: 'She said "hi"', artist: "Demo", source: "audius", score: 0.4 },
    ]);
  });

  it("returns [] for empty / null-ish inputs (does not throw)", () => {
    expect(parseRerankResponse("")).toEqual([]);
    expect(parseRerankResponse("   ")).toEqual([]);
    expect(parseRerankResponse("just prose, no json here")).toEqual([]);
  });

  it("returns [] for JSON that doesn't contain a `ranked` array (does not throw)", () => {
    expect(parseRerankResponse(`{"hello":"world"}`)).toEqual([]);
    expect(parseRerankResponse(`{"ranked":"not an array"}`)).toEqual([]);
  });

  it("filters out malformed entries but keeps the well-formed ones", () => {
    const mixed = `\`\`\`json
{"ranked":[
  {"title":"OK","artist":"Yes","source":"audius","score":0.8},
  {"title":42,"artist":"BadTitle","source":"audius","score":0.5},
  {"title":"NoScore","artist":"Missing","source":"audius"},
  {"title":"AlsoOK","artist":"Sure","source":"soundcloud","score":0.6}
]}
\`\`\``;
    expect(parseRerankResponse(mixed)).toEqual([
      { title: "OK", artist: "Yes", source: "audius", score: 0.8 },
      { title: "AlsoOK", artist: "Sure", source: "soundcloud", score: 0.6 },
    ]);
  });

  it("is deterministic — same input always produces the same output", () => {
    const fenced = "```json\n" + BARE_RERANK_JSON + "\n```";
    expect(parseRerankResponse(fenced)).toEqual(parseRerankResponse(fenced));
  });
});
