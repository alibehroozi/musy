import type { ProviderName, TasteProfile } from "@moc/contracts";

import { firstJsonObjectIn } from "./llm-json.js";

// How many picks the LLM is asked to select from the candidate pool.
export const TASTE_DRIVEN_PICKS_TARGET = 25;

// Bound on the candidate pool size that reaches the prompt.
export const TASTE_DRIVEN_MAX_CANDIDATE_POOL = 100;

// Truncate the profile-summary text to a hard byte cap.
export const TASTE_DRIVEN_MAX_PROFILE_SUMMARY_BYTES = 4 * 1024;

// One projected candidate from the upstream search provider.
export interface TasteDrivenPromptCandidate {
  title: string;
  artist: string;
  source: ProviderName;
}

// One projected song from interest_scores, identified only by (title, artist).
// Score does not enter the prompt — the bucket is the implicit signal (AI-19).
export interface TasteDrivenScoreBucketEntry {
  title: string;
  artist: string;
}

// Three sampled lists of songs from the user's interest_scores, grouped by
// score range: low (0–3), mid (4–7), high (8–10).
export interface TasteDrivenScoreBuckets {
  low: TasteDrivenScoreBucketEntry[];
  mid: TasteDrivenScoreBucketEntry[];
  high: TasteDrivenScoreBucketEntry[];
}

export interface BuildTasteDrivenPickPromptInput {
  profile: TasteProfile;
  candidatePool: TasteDrivenPromptCandidate[];
  scoreBuckets: TasteDrivenScoreBuckets;
}

export interface BuildTasteDrivenPickPromptOutput {
  system: string;
  userMessage: string;
}

// Only these profile fields ever reach the prompt body (AI-19).
interface ProjectedProfile {
  genres: Array<{ name: string; score: number }>;
  artists: Array<{ name: string; score: number }>;
  summaryText: string;
  tempoBucket: TasteProfile["tempoBucket"];
  remixPreference: TasteProfile["remixPreference"];
}

const SYSTEM_PROMPT = [
  "You are a music recommendation engine. The user has a taste profile and a pool of",
  "candidate tracks to choose from.",
  "",
  `Pick exactly ${TASTE_DRIVEN_PICKS_TARGET} tracks from the candidatePool that best match`,
  "the listener's taste profile. Rules:",
  "  1. Each entry must be a verbatim (title, artist) pair from the candidatePool — do not",
  "     paraphrase, substitute, or invent new tracks.",
  "  2. At most 2 tracks per artist in your final selection.",
  "  3. The scoreBuckets are anti-context: `high` entries are for vibe-affinity (lean toward",
  "     similar sounds), `low` entries are for vibe-avoidance (lean away from similar sounds).",
  "     `mid` entries are neutral. Do not repeat scoreBuckets entries — they are already-rated",
  "     tracks, not recommendations.",
  "  4. If the pool has fewer than the target count, return all of them.",
  "",
  "Reason only from (profile, scoreBuckets, candidatePool). The listener's identity, account,",
  "IP, and raw swipe directions are not provided and must not be invented or referenced.",
  "",
  "Output strictly this JSON shape — no prose, no code fences:",
  "{",
  '  "picks": [ { "title": string, "artist": string } ]',
  "}",
].join("\n");

function projectCandidate(c: TasteDrivenPromptCandidate): TasteDrivenPromptCandidate {
  return { title: c.title, artist: c.artist, source: c.source };
}

function projectBucketEntry(e: TasteDrivenScoreBucketEntry): TasteDrivenScoreBucketEntry {
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
  if (Buffer.byteLength(summary, "utf8") <= TASTE_DRIVEN_MAX_PROFILE_SUMMARY_BYTES) return summary;
  let s = summary;
  while (Buffer.byteLength(s, "utf8") > TASTE_DRIVEN_MAX_PROFILE_SUMMARY_BYTES) {
    s = s.slice(0, -1);
  }
  return s;
}

/**
 * Pure function turning the per-rebuild inputs into the (system, userMessage)
 * pair handed to the Anthropic SDK for the final-pick step of the taste-driven
 * phase.
 *
 * Identity-free (AI-19): userId, email, IP, session token, and raw swipe
 * direction history never appear in the output bytes. Score-bucket entries
 * carry {title, artist} only — no numeric scores.
 *
 * Deterministic (LOGIC-51): equal inputs always produce byte-identical output,
 * so the SDK's prompt-cache key derives from a stable key.
 *
 * Truncations:
 *   - candidatePool sliced to TASTE_DRIVEN_MAX_CANDIDATE_POOL.
 *   - profile.summaryText truncated to TASTE_DRIVEN_MAX_PROFILE_SUMMARY_BYTES.
 */
export function buildTasteDrivenPickPrompt(
  input: BuildTasteDrivenPickPromptInput,
): BuildTasteDrivenPickPromptOutput {
  const candidatePool = input.candidatePool
    .slice(0, TASTE_DRIVEN_MAX_CANDIDATE_POOL)
    .map(projectCandidate);
  const scoreBuckets: TasteDrivenScoreBuckets = {
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

export interface TasteDrivenPickItem {
  title: string;
  artist: string;
}

export interface TasteDrivenPickResponse {
  picks: TasteDrivenPickItem[];
}

/**
 * Parses the taste-driven pick LLM's `{"picks":[...]}` JSON response,
 * tolerating markdown code fences and surrounding prose.
 *
 * Total (never throws, LOGIC-52). Returns `{ picks: [] }` on any parse
 * failure, missing key, or malformed entries. Malformed entries inside the
 * array are dropped silently; well-formed ones survive.
 */
export function parseTasteDrivenPickResponse(text: string): TasteDrivenPickResponse {
  const empty: TasteDrivenPickResponse = { picks: [] };

  const objText = firstJsonObjectIn(text);
  if (objText === null) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(objText);
  } catch {
    return empty;
  }
  if (!parsed || typeof parsed !== "object") return empty;

  const raw = (parsed as { picks?: unknown }).picks;
  if (!Array.isArray(raw)) return empty;

  const picks: TasteDrivenPickItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const item = r as Partial<TasteDrivenPickItem>;
    if (typeof item.title === "string" && typeof item.artist === "string") {
      picks.push({ title: item.title, artist: item.artist });
    }
  }
  return { picks };
}
