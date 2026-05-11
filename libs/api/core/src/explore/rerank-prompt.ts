import type { ProviderName } from "@moc/contracts";

import { firstJsonObjectIn } from "./llm-json.js";

// Bound on the candidate pool size that reaches the prompt. Above this
// the LLM tends to over-truncate the output anyway and the cost-per-call
// ramps without improving rerank quality. Inputs above the cap are
// truncated newest-first.
export const MAX_RERANK_CANDIDATES = 100;

// Truncate the profile-summary text to a hard byte cap so a misbehaving
// upstream summary never blows past the model context window.
export const MAX_PROFILE_SUMMARY_BYTES = 4 * 1024;

// Only these candidate fields ever reach the prompt. Same projection
// posture as buildTastePrompt — narrowing the input surface is what
// makes AI-04 / PRIVACY-09 trivially auditable.
export interface PromptCandidate {
  title: string;
  artist: string;
  source: ProviderName;
}

export interface BuildRerankPromptInput {
  candidatePool: PromptCandidate[];
  profileSummary: string;
}

export interface BuildRerankPromptOutput {
  system: string;
  userMessage: string;
}

const SYSTEM_PROMPT = [
  "You are a music recommendation reranker. Given a candidate pool of",
  "tracks (each with title, artist, and provider source) and a short",
  "free-text summary of a listener's recent taste, score each candidate's",
  "appeal to that listener on a 0..1 scale.",
  "",
  "Use your training-time world knowledge of fandom adjacency — listeners",
  "who enjoy [Artist X] often also enjoy listeners-similar-to-X — to",
  "elevate tracks the summary suggests they would gravitate to. The",
  "listener's identity, account, and IP are not provided and must not be",
  "invented or referenced — reason only from (candidatePool, profileSummary).",
  "",
  "Output strictly this JSON shape — no prose, no code fences:",
  "{",
  '  "ranked": [',
  '    { "title": string, "artist": string, "source": string, "score": number 0..1 }',
  "  ]",
  "}",
  "Sort `ranked` desc by score. Include every candidate exactly once.",
].join("\n");

function projectCandidate(c: PromptCandidate): PromptCandidate {
  return { title: c.title, artist: c.artist, source: c.source };
}

function truncateSummary(summary: string): string {
  if (Buffer.byteLength(summary, "utf8") <= MAX_PROFILE_SUMMARY_BYTES) return summary;
  let s = summary;
  while (Buffer.byteLength(s, "utf8") > MAX_PROFILE_SUMMARY_BYTES) {
    s = s.slice(0, -1);
  }
  return s;
}

/**
 * Pure function that turns the per-rerank inputs into the (system, userMessage)
 * pair handed to the Anthropic SDK. Identity-free — userId / email / IP /
 * session / raw swipe-direction history are not arguments and therefore
 * cannot leak into the prompt body (AI-04, PRIVACY-09). Deterministic —
 * equal inputs always produce byte-identical output, which is what the
 * SDK's prompt-cache key derives from (AI-05).
 *
 * Inputs are expected newest-first; the helper keeps the most recent
 * MAX_RERANK_CANDIDATES candidates and truncates the profile summary
 * to MAX_PROFILE_SUMMARY_BYTES.
 */
export function buildRerankPrompt(input: BuildRerankPromptInput): BuildRerankPromptOutput {
  const candidatePool = input.candidatePool.slice(0, MAX_RERANK_CANDIDATES).map(projectCandidate);
  const profileSummary = truncateSummary(input.profileSummary);

  const userPayload = { candidatePool, profileSummary };

  return {
    system: SYSTEM_PROMPT,
    userMessage: JSON.stringify(userPayload),
  };
}

// The shape the rerank LLM is asked to emit per element of `ranked`.
// Kept separate from `PromptCandidate` because the LLM adds a `score`
// and may return a `source` outside the strict `ProviderName` union.
export interface RerankItem {
  title: string;
  artist: string;
  source: string;
  score: number;
}

/**
 * Parses the rerank LLM's `{"ranked": [...]}` JSON response, tolerating
 * the wrappers Haiku (and other models) routinely add — markdown code
 * fences (` ```json ` / ` ``` `), leading prose, trailing prose, and
 * any text outside the first balanced `{ … }` object. Pure: same input
 * always produces the same output; never throws; malformed entries
 * inside `ranked` are dropped silently and the well-formed ones
 * survive. Returns `[]` for unparseable input or for valid JSON
 * objects whose `ranked` field isn't an array.
 */
export function parseRerankResponse(text: string): RerankItem[] {
  const objText = firstJsonObjectIn(text);
  if (objText === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(objText);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const ranked = (parsed as { ranked?: unknown }).ranked;
  if (!Array.isArray(ranked)) return [];
  const out: RerankItem[] = [];
  for (const r of ranked) {
    if (!r || typeof r !== "object") continue;
    const item = r as Partial<RerankItem>;
    if (
      typeof item.title === "string" &&
      typeof item.artist === "string" &&
      typeof item.source === "string" &&
      typeof item.score === "number"
    ) {
      out.push({
        title: item.title,
        artist: item.artist,
        source: item.source,
        score: item.score,
      });
    }
  }
  return out;
}
