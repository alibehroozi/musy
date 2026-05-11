import { TasteProfileLLMOutput, type SongSnapshot, type SwipeDirection } from "@moc/contracts";

import { firstJsonObjectIn } from "./llm-json.js";

// Bounds (AI-03). Inputs above the cap are dropped newest-first — the most
// recent N entries are retained, the rest discarded. previousSummary is
// truncated to 4 KB.
export const MAX_SWIPES = 200;
export const MAX_LISTENS = 100;
export const MAX_SUMMARY_BYTES = 4 * 1024;

// Only these snapshot fields ever reach the prompt. We deliberately drop
// coverUrl, year, durationSec, etc. — the LLM is reasoning about taste,
// not artwork. Narrowing the surface also makes AI-01 / PRIVACY-08
// trivially auditable: anything not in this projection is simply absent.
export interface PromptSwipe {
  title: string;
  artist: string;
  kind: SongSnapshot["kind"];
  direction: SwipeDirection;
  at: string;
}

export interface PromptListen {
  title: string;
  artist: string;
  kind: SongSnapshot["kind"];
  eventType: "started" | "completed";
  at: string;
}

export interface BuildTastePromptInput {
  recentSwipes: PromptSwipe[];
  recentListens: PromptListen[];
  previousSummary: string | null;
}

export interface BuildTastePromptOutput {
  system: string;
  userMessage: string;
}

const SYSTEM_PROMPT = [
  "You are a music-taste analyst. Given a user's recent swipe verdicts",
  "(right = liked, left = passed) and recent listening events (started",
  "vs completed), produce a JSON taste profile.",
  "",
  "The user's identity, account, and IP are not provided and must not",
  "be invented or referenced — reason only from the listed swipes,",
  "listens, and previous-summary text.",
  "",
  "Output strictly this JSON shape — no prose, no code fences:",
  "{",
  '  "genres": [{ "name": string, "score": number 0..1 }, ...] sorted desc by score,',
  '  "artists": [{ "name": string, "score": number 0..1 }, ...] sorted desc by score,',
  '  "tempoBucket": "slow" | "mid" | "fast" | null,',
  '  "remixPreference": "original" | "remix-friendly" | "remix-only" | null,',
  '  "summaryText": string  // <= 500 chars, second-person ("you tend to ...")',
  "}",
].join("\n");

function projectSwipe(s: PromptSwipe): PromptSwipe {
  return { title: s.title, artist: s.artist, kind: s.kind, direction: s.direction, at: s.at };
}

function projectListen(l: PromptListen): PromptListen {
  return {
    title: l.title,
    artist: l.artist,
    kind: l.kind,
    eventType: l.eventType,
    at: l.at,
  };
}

function truncateSummary(summary: string | null): string | null {
  if (summary === null) return null;
  if (Buffer.byteLength(summary, "utf8") <= MAX_SUMMARY_BYTES) return summary;
  // UTF-8 safe truncate: shave one char at a time until under the byte cap.
  let s = summary;
  while (Buffer.byteLength(s, "utf8") > MAX_SUMMARY_BYTES) {
    s = s.slice(0, -1);
  }
  return s;
}

/**
 * Pure function that turns the per-build inputs into the (system, userMessage)
 * pair handed to the Anthropic SDK. Deterministic — equal inputs always
 * produce byte-identical output, which is what the SDK's prompt-cache key
 * derives from. Identity-free — userId / email / IP / session are not
 * arguments and therefore cannot leak into the prompt body (AI-01,
 * PRIVACY-08).
 *
 * Inputs are expected newest-first; the helper keeps the most recent
 * MAX_SWIPES swipes and MAX_LISTENS listens (AI-03). previousSummary is
 * truncated to MAX_SUMMARY_BYTES.
 */
export function buildTastePrompt(input: BuildTastePromptInput): BuildTastePromptOutput {
  const recentSwipes = input.recentSwipes.slice(0, MAX_SWIPES).map(projectSwipe);
  const recentListens = input.recentListens.slice(0, MAX_LISTENS).map(projectListen);
  const previousSummary = truncateSummary(input.previousSummary);

  const userPayload = { recentSwipes, recentListens, previousSummary };

  return {
    system: SYSTEM_PROMPT,
    userMessage: JSON.stringify(userPayload),
  };
}

/**
 * Parses the taste-profile LLM response, tolerating the wrappers Haiku
 * (and other models) routinely add — markdown code fences, leading
 * prose, trailing prose — and validates the parsed object against the
 * `TasteProfileLLMOutput` Zod schema.
 *
 * Unlike `parseColdStartResponse` / `parseRerankResponse` (which return
 * `[]` sentinels on failure), this function THROWS on any failure: no
 * JSON object found, syntactically invalid JSON, or schema mismatch.
 * The caller (`profile-builder.service.ts`) cannot proceed without a
 * valid profile, and the existing try/catch on the call site logs the
 * original error detail in the `taste_profile_build_failed` event.
 */
export function parseTasteProfileResponse(text: string): TasteProfileLLMOutput {
  const objText = firstJsonObjectIn(text);
  if (objText === null) {
    throw new SyntaxError("no JSON object found in taste-profile response");
  }
  const json: unknown = JSON.parse(objText);
  return TasteProfileLLMOutput.parse(json);
}
