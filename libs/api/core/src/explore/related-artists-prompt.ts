import type { TasteProfile } from "@moc/contracts";

import { firstJsonObjectIn } from "./llm-json.js";

// Caller-configurable cap on how many high-bucket samples reach the prompt.
// The cap is the privacy lever (PRIVACY-17): it bounds how much of the
// user's listening surface crosses to the LLM without truncating profiles
// aggressively. Sampling is random (caller's responsibility); the cap
// keeps the count deterministic from the prompt's perspective.
export const RELATED_ARTISTS_HIGH_BUCKET_SAMPLE_CAP = 10;

// Truncate the profile-summary text to a hard byte cap so a long upstream
// summary never blows past the model context window.
export const RELATED_ARTISTS_MAX_PROFILE_SUMMARY_BYTES = 4 * 1024;

// One high-bucket sample: {title, artist} only, no score (PRIVACY-17 / AI-18).
export interface HighBucketSample {
  title: string;
  artist: string;
}

export interface BuildRelatedArtistsPromptInput {
  profile: TasteProfile;
  highBucketSamples: HighBucketSample[];
  shuffledSeedArtists: string[];
}

export interface BuildRelatedArtistsPromptOutput {
  system: string;
  userMessage: string;
}

// Only these profile fields ever reach the prompt body (AI-18, PRIVACY-17).
// Notably absent: userId, lastBuiltAt, swipeCountAtLastBuild, raw scores per
// bucket entry.
interface ProjectedProfile {
  genres: Array<{ name: string; score: number }>;
  artists: Array<{ name: string; score: number }>;
  summaryText: string;
  tempoBucket: TasteProfile["tempoBucket"];
  remixPreference: TasteProfile["remixPreference"];
}

const SYSTEM_PROMPT = [
  "You are a music taste advisor. Given a user's taste profile, suggest ~15 adjacent artists.",
  "These should be artists the user probably hasn't listened to much but would likely enjoy.",
  "Cross-reference the profile's `artists` list — lean toward adjacent artists not already",
  "in the profile, but if a profile artist genuinely fits the adjacency request you may",
  "include them (soft preference, not a ban).",
  "",
  "Use the `highBucketSamples` (songs the user has rated highly) as additional taste signal.",
  "Use `shuffledSeedArtists` as the starting point for adjacency reasoning — find artists",
  "that share sound, era, or genre space with those seeds.",
  "",
  "Spread across the user's genres but stay sound-adjacent to the profile. Include artists",
  "from different eras and sub-genres if they fit the taste shape.",
  "",
  "Output strictly this JSON shape — no prose, no code fences:",
  '{ "relatedArtists": [ string ] }',
  "~15 distinct artist name strings. No commentary.",
].join("\n");

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
  if (Buffer.byteLength(summary, "utf8") <= RELATED_ARTISTS_MAX_PROFILE_SUMMARY_BYTES)
    return summary;
  let s = summary;
  while (Buffer.byteLength(s, "utf8") > RELATED_ARTISTS_MAX_PROFILE_SUMMARY_BYTES) {
    s = s.slice(0, -1);
  }
  return s;
}

function projectSample(s: HighBucketSample): HighBucketSample {
  return { title: s.title, artist: s.artist };
}

/**
 * Pure function turning the per-rebuild inputs into the (system, userMessage)
 * pair handed to the Anthropic SDK for the related-artists step of the
 * taste-driven phase.
 *
 * Identity-free (AI-18, PRIVACY-17): userId, email, IP, session token,
 * and numeric scores never appear in the output bytes.
 *
 * Deterministic (LOGIC-48, LOGIC-49): equal inputs always produce byte-
 * identical output. Caller is responsible for shuffling `shuffledSeedArtists`
 * before passing them — this helper is order-preserving and does no shuffling
 * of its own, keeping the prompt a stable cache key for equal inputs.
 *
 * Truncations:
 *   - highBucketSamples sliced to RELATED_ARTISTS_HIGH_BUCKET_SAMPLE_CAP.
 *   - profile.summaryText truncated to RELATED_ARTISTS_MAX_PROFILE_SUMMARY_BYTES.
 */
export function buildRelatedArtistsPrompt(
  input: BuildRelatedArtistsPromptInput,
): BuildRelatedArtistsPromptOutput {
  const profile = projectProfile(input.profile);
  const highBucketSamples = input.highBucketSamples
    .slice(0, RELATED_ARTISTS_HIGH_BUCKET_SAMPLE_CAP)
    .map(projectSample);
  const shuffledSeedArtists = [...input.shuffledSeedArtists];

  const userPayload = { profile, highBucketSamples, shuffledSeedArtists };

  return {
    system: SYSTEM_PROMPT,
    userMessage: JSON.stringify(userPayload),
  };
}

export interface RelatedArtistsResponse {
  relatedArtists: string[];
}

/**
 * Parses the related-artists LLM's `{"relatedArtists":[...]}` JSON response,
 * tolerating markdown code fences and surrounding prose.
 *
 * Total (never throws, LOGIC-50). Returns `{ relatedArtists: [] }` on any
 * parse failure, missing key, or non-string elements.
 */
export function parseRelatedArtistsResponse(text: string): RelatedArtistsResponse {
  const empty: RelatedArtistsResponse = { relatedArtists: [] };

  const objText = firstJsonObjectIn(text);
  if (objText === null) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(objText);
  } catch {
    return empty;
  }
  if (!parsed || typeof parsed !== "object") return empty;

  const raw = (parsed as { relatedArtists?: unknown }).relatedArtists;
  if (!Array.isArray(raw)) return empty;

  const relatedArtists: string[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.length > 0) {
      relatedArtists.push(item);
    }
  }
  return { relatedArtists };
}
