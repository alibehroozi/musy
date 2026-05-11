import type { ProviderName, TasteProfile } from "@moc/contracts";

import { firstJsonObjectIn } from "./llm-json.js";

// How many candidates the LLM is asked to pick out of the pool.
export const PERSONALIZED_PICKS_TARGET = 10;

// How many fresh / novel suggestions the LLM is asked to generate. These
// must not overlap with any score-bucket entry (the user's already-rated
// history) — the prompt asks for that explicitly and the parser tolerates
// the LLM occasionally violating the rule (caller dedupes against seen).
export const PERSONALIZED_NOVEL_TARGET = 10;

// Bound on the candidate pool size that reaches the prompt. Beyond this
// the LLM over-truncates anyway and per-call cost ramps without quality
// gain. Truncates newest-first per caller semantics.
export const MAX_CANDIDATE_POOL = 100;

// Truncate the profile-summary text to a hard byte cap so a misbehaving
// upstream summary never blows past the model context window.
export const MAX_PROFILE_SUMMARY_BYTES = 4 * 1024;

// One projected candidate from the upstream search providers. Same shape
// as the old `PromptCandidate` from `rerank-prompt.ts`.
export interface PersonalizedPromptCandidate {
  title: string;
  artist: string;
  source: ProviderName;
}

// One projected song from interest_scores, identified only by (title,
// artist). The score itself does not enter the prompt — the bucket is
// the implicit signal ("low" / "mid" / "high"). Keeping the entries
// minimal mirrors AI-04 / PRIVACY-09's projection discipline.
export interface ScoreBucketEntry {
  title: string;
  artist: string;
}

// Three sampled lists of songs from the user's interest_scores, grouped
// by score range. Per the design: 10 random from score 0–3 ("low" — user
// pressed play but didn't finish), 10 from 4–7 ("mid" — played to end),
// 10 from 8–10 ("high" — saved / right-swiped). Actual counts may be
// fewer if interest_scores is sparse; the prompt mentions actual counts.
export interface PersonalizedScoreBuckets {
  low: ScoreBucketEntry[];
  mid: ScoreBucketEntry[];
  high: ScoreBucketEntry[];
}

export interface BuildPersonalizedPromptInput {
  profile: TasteProfile;
  scoreBuckets: PersonalizedScoreBuckets;
  candidatePool: PersonalizedPromptCandidate[];
}

export interface BuildPersonalizedPromptOutput {
  system: string;
  userMessage: string;
}

// Only these profile fields ever reach the prompt body — narrowing the
// surface area is what makes AI-04 / PRIVACY-09 trivially auditable.
// Notably absent: userId, lastBuiltAt, swipeCountAtLastBuild.
interface ProjectedProfile {
  genres: Array<{ name: string; score: number }>;
  artists: Array<{ name: string; score: number }>;
  summaryText: string;
  tempoBucket: TasteProfile["tempoBucket"];
  remixPreference: TasteProfile["remixPreference"];
}

const SYSTEM_PROMPT = [
  "You are a music recommendation engine. The user has a taste profile and",
  "a history of songs rated at three score levels. Your task is to produce",
  "two parallel lists:",
  "",
  `  1. picks_from_pool — pick the ${PERSONALIZED_PICKS_TARGET} best fits from the`,
  "     provided candidatePool. Each entry must be a verbatim (title, artist)",
  "     pair from the pool — do not paraphrase or substitute.",
  "",
  `  2. novel_suggestions — generate ${PERSONALIZED_NOVEL_TARGET} fresh tracks not`,
  "     present in any of the scoreBuckets entries (high / mid / low), chosen",
  "     to extend the listener's taste based on the profile. These must be",
  "     real tracks (not invented titles); use your training-time world",
  "     knowledge of fandom adjacency.",
  "",
  "Reason only from (profile, scoreBuckets, candidatePool). The listener's",
  "identity, account, IP, and raw swipe directions are not provided and must",
  "not be invented or referenced.",
  "",
  "Output strictly this JSON shape — no prose, no code fences:",
  "{",
  '  "picks_from_pool": [ { "title": string, "artist": string } ],',
  '  "novel_suggestions": [ { "title": string, "artist": string } ]',
  "}",
].join("\n");

function projectCandidate(c: PersonalizedPromptCandidate): PersonalizedPromptCandidate {
  return { title: c.title, artist: c.artist, source: c.source };
}

function projectBucketEntry(e: ScoreBucketEntry): ScoreBucketEntry {
  return { title: e.title, artist: e.artist };
}

function projectProfile(profile: TasteProfile): ProjectedProfile {
  return {
    genres: profile.genres.map((g) => ({ name: g.name, score: g.score })),
    artists: profile.artists.map((a) => ({ name: a.name, score: a.score })),
    summaryText: truncateSummary(profile.summaryText),
    tempoBucket: profile.tempoBucket,
    remixPreference: profile.remixPreference,
  };
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
 * Pure function turning the per-rebuild inputs into the (system, userMessage)
 * pair handed to the Anthropic SDK for the personalized phase. Identity-free
 * (AI-04, PRIVACY-09); deterministic (AI-05) — equal inputs always produce
 * byte-identical output, so the SDK's prompt-cache key derives from a stable
 * key.
 *
 * Callers performing pre-prompt randomization (e.g. shuffling profile.artists
 * to 5-of-N) are responsible for producing the same shuffled profile if they
 * want cache hits across calls; this builder itself is order-preserving.
 *
 * Truncations:
 *   - candidatePool slice to MAX_CANDIDATE_POOL (newest-first).
 *   - profile.summaryText truncate to MAX_PROFILE_SUMMARY_BYTES.
 */
export function buildPersonalizedPrompt(
  input: BuildPersonalizedPromptInput,
): BuildPersonalizedPromptOutput {
  const candidatePool = input.candidatePool.slice(0, MAX_CANDIDATE_POOL).map(projectCandidate);
  const scoreBuckets: PersonalizedScoreBuckets = {
    low: input.scoreBuckets.low.map(projectBucketEntry),
    mid: input.scoreBuckets.mid.map(projectBucketEntry),
    high: input.scoreBuckets.high.map(projectBucketEntry),
  };
  const profile = projectProfile(input.profile);

  const userPayload = { profile, scoreBuckets, candidatePool };

  return {
    system: SYSTEM_PROMPT,
    userMessage: JSON.stringify(userPayload),
  };
}

// Output shape — what the LLM is asked to emit per entry.
export interface PersonalizedItem {
  title: string;
  artist: string;
}

export interface PersonalizedResponse {
  picks_from_pool: PersonalizedItem[];
  novel_suggestions: PersonalizedItem[];
}

/**
 * Parses the personalized LLM's
 *   `{"picks_from_pool":[...], "novel_suggestions":[...]}`
 * JSON response, tolerating the wrappers Haiku and other models routinely
 * add — markdown code fences (` ```json ` / ` ``` `), leading prose,
 * trailing prose, and any text outside the first balanced `{ … }` object.
 * Pure: same input always produces the same output; never throws;
 * malformed entries inside either array are dropped silently and the
 * well-formed ones survive. Returns
 *   `{ picks_from_pool: [], novel_suggestions: [] }`
 * for unparseable input, missing keys, or wrong-type values (LOGIC-24).
 */
export function parsePersonalizedResponse(text: string): PersonalizedResponse {
  const empty: PersonalizedResponse = { picks_from_pool: [], novel_suggestions: [] };

  const objText = firstJsonObjectIn(text);
  if (objText === null) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(objText);
  } catch {
    return empty;
  }
  if (!parsed || typeof parsed !== "object") return empty;

  return {
    picks_from_pool: extractItems((parsed as { picks_from_pool?: unknown }).picks_from_pool),
    novel_suggestions: extractItems((parsed as { novel_suggestions?: unknown }).novel_suggestions),
  };
}

function extractItems(raw: unknown): PersonalizedItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PersonalizedItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const item = r as Partial<PersonalizedItem>;
    if (typeof item.title === "string" && typeof item.artist === "string") {
      out.push({ title: item.title, artist: item.artist });
    }
  }
  return out;
}
