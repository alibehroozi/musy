import { firstJsonObjectIn } from "./llm-json.js";

// Number of genre/era/mood scenes Claude generates per discovery rebuild.
export const DISCOVERY_SCENES_COUNT = 8;

// Cap on the soft-signal payload — same safety bound as COLD_START_MAX_RECENT_SWIPES.
// Discovery phase exits at ~20 swipes; this is a defense-in-depth upper bound.
export const DISCOVERY_SCENES_MAX_RECENT_SWIPES = 50;

// Fixed system prompt for the no-swipes (first-call) path. Kept as a module-
// level constant so the bytes are stable — callers that omit recentSwipes
// always hit the same Anthropic prompt-cache key (LOGIC-46).
const BASE_SYSTEM_PROMPT = [
  "You are a music curator. A brand-new user just signed up for a music discovery app.",
  "Your task is to generate diverse search scene phrases for SoundCloud.",
  "Each scene is a short genre+era+mood keyword phrase suitable for a SoundCloud search query.",
  `Examples: "early 2000s french touch house", "dreamy slow shoegaze", "90s NYC underground hip-hop".`,
  "",
  "Cover a wide spread: pop, rock, hip-hop, electronic, jazz, R&B, indie, classical,",
  "country, metal, latin, and world music. Mix eras (classic to contemporary), tempos,",
  "and moods. Each scene should be distinct and retrieve genuinely different music.",
  "",
  "Output strictly this JSON shape — no prose, no code fences:",
  `{ "scenes": [ string ] }`,
  `Exactly ${DISCOVERY_SCENES_COUNT} scenes. No duplicates. No commentary.`,
].join("\n");

const BASE_USER_MESSAGE = `Generate ${DISCOVERY_SCENES_COUNT} diverse SoundCloud search scene phrases for a new user's music discovery.`;

// Soft-signal preamble — mirrors the cold-start prompt's phrasing (LOGIC-28)
// but scoped to scenes: the model leans the scene vocabulary toward the feel
// of right-swiped items without excluding any genre or era.
const SOFT_SIGNAL_PREAMBLE = [
  "",
  "The user has already reacted to some early suggestions — see the",
  "`recentSwipes` array in the user message. Each entry has",
  '`direction: "right"` (liked) or `direction: "left"` (disliked).',
  "Use these as a SOFT signal when choosing scene phrases:",
  "  - Lean toward the feel of right-swiped entries (genre, era, mood).",
  "  - Lean away from the feel of left-swiped entries.",
  "  - Do not repeat the exact artists or titles already swiped.",
  "  - Scenes are keyword phrases, not artist names — keep them genre/era/mood only.",
].join("\n");

export interface DiscoveryScenesSwipe {
  title: string;
  artist: string;
  direction: "right" | "left";
}

export interface BuildDiscoveryScenesPromptInput {
  recentSwipes?: DiscoveryScenesSwipe[];
}

function projectSwipe(s: DiscoveryScenesSwipe): DiscoveryScenesSwipe {
  return { title: s.title, artist: s.artist, direction: s.direction };
}

/**
 * Build the discovery-scenes prompt.
 *
 * When `recentSwipes` is omitted or empty the output is byte-identical to the
 * base version — the Anthropic prompt-cache key for first-call cold discovery
 * never moves (LOGIC-46). When present, the system prompt gains a soft-signal
 * section and the user message carries the projected `{title, artist, direction}`
 * per swipe (AI-17: no userId, email, IP, or session token ever reaches the
 * prompt body).
 *
 * Pure, deterministic, never throws (LOGIC-45).
 */
export function buildDiscoveryScenesPrompt(input?: BuildDiscoveryScenesPromptInput): {
  system: string;
  userMessage: string;
} {
  const recentSwipes = (input?.recentSwipes ?? []).slice(0, DISCOVERY_SCENES_MAX_RECENT_SWIPES);

  if (recentSwipes.length === 0) {
    return { system: BASE_SYSTEM_PROMPT, userMessage: BASE_USER_MESSAGE };
  }

  const projected = recentSwipes.map(projectSwipe);
  const userMessage = [
    `Generate ${DISCOVERY_SCENES_COUNT} diverse SoundCloud search scene phrases informed by the user's recent reactions:`,
    JSON.stringify({ recentSwipes: projected }),
  ].join("\n");

  return {
    system: BASE_SYSTEM_PROMPT + SOFT_SIGNAL_PREAMBLE,
    userMessage,
  };
}

export interface DiscoveryScenesResult {
  scenes: string[];
}

/**
 * Parse the Claude response for discovery scenes.
 *
 * Total (never throws, LOGIC-47). Extracts `{ scenes: string[] }` from the
 * first balanced JSON object in `text`, tolerating markdown code fences.
 * Returns `{ scenes: [] }` on any parse failure.
 */
export function parseDiscoveryScenesResponse(text: string): DiscoveryScenesResult {
  const objText = firstJsonObjectIn(text);
  if (objText === null) return { scenes: [] };
  let parsed: { scenes?: unknown };
  try {
    parsed = JSON.parse(objText) as { scenes?: unknown };
  } catch {
    return { scenes: [] };
  }
  if (!parsed?.scenes || !Array.isArray(parsed.scenes)) return { scenes: [] };
  const scenes: string[] = [];
  for (const item of parsed.scenes) {
    if (typeof item === "string") scenes.push(item);
  }
  return { scenes };
}
