import type { ProviderName, TasteProfile } from "@moc/contracts";

import { firstJsonObjectIn } from "./llm-json.js";

// How many candidates the LLM is asked to pick out of the pool. Smaller
// than the personalized phase's 10+10 because refinement is conservative
// — the user is still confirming what works, so a tighter focused list
// beats one with novel guesses.
export const ARTIST_REFINEMENT_PICKS_TARGET = 20;

// Bound on the candidate pool size that reaches the prompt. With top-N
// profile artists × top-5 SoundCloud hits each the pool is well under
// 100 in practice; this is a defense-in-depth cap so a misbehaving
// caller can't blow the context window.
export const ARTIST_REFINEMENT_MAX_CANDIDATE_POOL = 100;

// Truncate the profile-summary text to a hard byte cap so a long
// upstream summary never blows past the model context window.
export const ARTIST_REFINEMENT_MAX_PROFILE_SUMMARY_BYTES = 4 * 1024;

// One projected candidate from the upstream search provider.
export interface ArtistRefinementPromptCandidate {
  title: string;
  artist: string;
  source: ProviderName;
}

export interface BuildArtistRefinementPromptInput {
  profile: TasteProfile;
  candidatePool: ArtistRefinementPromptCandidate[];
}

export interface BuildArtistRefinementPromptOutput {
  system: string;
  userMessage: string;
}

// Only these profile fields ever reach the prompt body — narrowing the
// surface area is what makes AI-09 / PRIVACY-10 trivially auditable.
// Notably absent: userId, lastBuiltAt, swipeCountAtLastBuild.
interface ProjectedProfile {
  genres: Array<{ name: string; score: number }>;
  artists: Array<{ name: string; score: number }>;
  summaryText: string;
  tempoBucket: TasteProfile["tempoBucket"];
  remixPreference: TasteProfile["remixPreference"];
}

const SYSTEM_PROMPT = [
  "You are a music recommendation engine. The user has a taste profile",
  "and a pool of candidate tracks sourced from their favorite artists.",
  "Your task is to pick the best fits from the candidatePool.",
  "",
  `Pick exactly ${ARTIST_REFINEMENT_PICKS_TARGET} tracks from candidatePool that`,
  "best match the listener's profile. Each entry must be a verbatim",
  "(title, artist) pair from the pool — do not paraphrase, substitute,",
  "or invent new tracks. If the pool has fewer than the target count,",
  "return all of them.",
  "",
  "Reason only from (profile, candidatePool). The listener's identity,",
  "account, IP, and raw swipe directions are not provided and must not",
  "be invented or referenced.",
  "",
  "Output strictly this JSON shape — no prose, no code fences:",
  "{",
  '  "picks": [ { "title": string, "artist": string } ]',
  "}",
].join("\n");

function projectCandidate(c: ArtistRefinementPromptCandidate): ArtistRefinementPromptCandidate {
  return { title: c.title, artist: c.artist, source: c.source };
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
  if (Buffer.byteLength(summary, "utf8") <= ARTIST_REFINEMENT_MAX_PROFILE_SUMMARY_BYTES)
    return summary;
  let s = summary;
  while (Buffer.byteLength(s, "utf8") > ARTIST_REFINEMENT_MAX_PROFILE_SUMMARY_BYTES) {
    s = s.slice(0, -1);
  }
  return s;
}

/**
 * Pure function turning the per-rebuild inputs into the (system, userMessage)
 * pair handed to the Anthropic SDK for the artist-refinement phase.
 * Identity-free (AI-09, PRIVACY-10); deterministic — equal inputs always
 * produce byte-identical output, so the SDK's prompt-cache key derives
 * from a stable key.
 *
 * Truncations:
 *   - candidatePool slice to ARTIST_REFINEMENT_MAX_CANDIDATE_POOL (caller order preserved).
 *   - profile.summaryText truncate to ARTIST_REFINEMENT_MAX_PROFILE_SUMMARY_BYTES.
 */
export function buildArtistRefinementPrompt(
  input: BuildArtistRefinementPromptInput,
): BuildArtistRefinementPromptOutput {
  const candidatePool = input.candidatePool
    .slice(0, ARTIST_REFINEMENT_MAX_CANDIDATE_POOL)
    .map(projectCandidate);
  const profile = projectProfile(input.profile);

  const userPayload = { profile, candidatePool };

  return {
    system: SYSTEM_PROMPT,
    userMessage: JSON.stringify(userPayload),
  };
}

export interface ArtistRefinementItem {
  title: string;
  artist: string;
}

export interface ArtistRefinementResponse {
  picks: ArtistRefinementItem[];
}

/**
 * Parses the artist-refinement LLM's `{"picks":[...]}` JSON response,
 * tolerating the wrappers Haiku and other models routinely add —
 * markdown code fences (` ```json ` / ` ``` `), leading prose, trailing
 * prose, and any text outside the first balanced `{ … }` object.
 * Pure: same input always produces the same output; never throws;
 * malformed entries inside the array are dropped silently and the
 * well-formed ones survive. Returns `{ picks: [] }` for unparseable
 * input, missing key, or wrong-type value (LOGIC-27).
 */
export function parseArtistRefinementResponse(text: string): ArtistRefinementResponse {
  const empty: ArtistRefinementResponse = { picks: [] };

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
    picks: extractItems((parsed as { picks?: unknown }).picks),
  };
}

function extractItems(raw: unknown): ArtistRefinementItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ArtistRefinementItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const item = r as Partial<ArtistRefinementItem>;
    if (typeof item.title === "string" && typeof item.artist === "string") {
      out.push({ title: item.title, artist: item.artist });
    }
  }
  return out;
}
