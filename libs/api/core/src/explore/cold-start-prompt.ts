import { firstJsonObjectIn } from "./llm-json.js";

// Number of songs Claude is asked to generate for a brand-new user.
export const COLD_START_COUNT = 30;

// Cap on the soft-signal payload — discovery phase usually exits at
// 20 swipes (when the profile builds), so this is a defense-in-depth
// upper bound rather than a tight one. Caller passes newest-first;
// older entries are dropped silently when over the cap.
export const COLD_START_MAX_RECENT_SWIPES = 50;

// Legacy prompt — used verbatim when `recentSwipes` is empty so the
// first-call prompt-cache key stays exactly where it has always been
// (LOGIC-28 byte-compat guarantee).
const LEGACY_SYSTEM_PROMPT = [
  "You are a music curator. A brand-new user just signed up for a music discovery app.",
  "Your task is to suggest a diverse initial set of songs to reveal their taste.",
  "",
  "Cover a wide spread: pop, rock, hip-hop, electronic, jazz, R&B, indie, classical,",
  "country, metal, latin, and world music. Mix eras (classic to contemporary), tempos,",
  "and moods. Include both mainstream hits and critically-acclaimed niche tracks so the",
  "app can discover what the listener gravitates toward.",
  "",
  "Output strictly this JSON shape — no prose, no code fences:",
  `{ "songs": [ { "title": string, "artist": string } ] }`,
  `Exactly ${COLD_START_COUNT} songs. No duplicates. No commentary.`,
].join("\n");

const LEGACY_USER_MESSAGE = `Generate ${COLD_START_COUNT} diverse songs for a new user's music discovery experience.`;

// Soft-signal preamble — appended to the legacy system prompt when the
// user has already reacted to some early suggestions. Phrased as
// "lean toward / away" so the model can still surface a different
// track by an artist the user has otherwise rejected, if that track
// fits the overall direction of their liked items.
const SOFT_SIGNAL_PREAMBLE = [
  "",
  "The user has already reacted to some early suggestions — see the",
  "`recentSwipes` array in the user message. Each entry has",
  '`direction: "right"` (liked) or `direction: "left"` (disliked).',
  "Use these as a SOFT signal:",
  "  - Lean toward the feel of the right-swiped entries.",
  "  - Lean away from the feel of the left-swiped entries.",
  "  - Same-artist-different-track is fine: if a different song by an",
  "    artist they previously left-swiped genuinely fits the direction",
  "    of their liked items, surface it. Artists are not excluded —",
  "    the soft signal is at the (title, artist) level, not the artist",
  "    level.",
  "  - Pick fresh tracks; don't repeat the exact (title, artist) pairs",
  "    they've already seen.",
].join("\n");

export interface ColdStartPromptSwipe {
  title: string;
  artist: string;
  direction: "right" | "left";
}

export interface BuildColdStartPromptInput {
  recentSwipes?: ColdStartPromptSwipe[];
}

export interface ColdStartSuggestion {
  title: string;
  artist: string;
}

function projectSwipe(s: ColdStartPromptSwipe): ColdStartPromptSwipe {
  return { title: s.title, artist: s.artist, direction: s.direction };
}

/**
 * Build the cold-start (discovery-phase) prompt.
 *
 * `recentSwipes` is optional. When omitted or empty, the output is
 * byte-identical to the pre-soft-signal version — the prompt-cache
 * key for first-call cold-start hits never moves (LOGIC-28). When
 * present, the system prompt gains a soft-signal section instructing
 * the model to lean toward right-swipe feel and away from left-swipe
 * feel without forbidding any artist, and the user message carries
 * the projected `{title, artist, direction}` per swipe.
 *
 * The function is pure, identity-free (AI-10), and deterministic.
 */
export function buildColdStartPrompt(input?: BuildColdStartPromptInput): {
  system: string;
  userMessage: string;
} {
  const recentSwipes = (input?.recentSwipes ?? []).slice(0, COLD_START_MAX_RECENT_SWIPES);

  if (recentSwipes.length === 0) {
    return { system: LEGACY_SYSTEM_PROMPT, userMessage: LEGACY_USER_MESSAGE };
  }

  const projected = recentSwipes.map(projectSwipe);
  const userMessage = [
    `Generate ${COLD_START_COUNT} diverse songs informed by the user's recent reactions:`,
    JSON.stringify({ recentSwipes: projected }),
  ].join("\n");

  return {
    system: LEGACY_SYSTEM_PROMPT + SOFT_SIGNAL_PREAMBLE,
    userMessage,
  };
}

export function parseColdStartResponse(text: string): ColdStartSuggestion[] {
  const objText = firstJsonObjectIn(text);
  if (objText === null) return [];
  let parsed: { songs?: unknown };
  try {
    parsed = JSON.parse(objText) as { songs?: unknown };
  } catch {
    return [];
  }
  if (!parsed?.songs || !Array.isArray(parsed.songs)) return [];
  const out: ColdStartSuggestion[] = [];
  for (const item of parsed.songs) {
    if (!item || typeof item !== "object") continue;
    const { title, artist } = item as Partial<Record<string, unknown>>;
    if (typeof title === "string" && typeof artist === "string") {
      out.push({ title, artist });
    }
  }
  return out;
}
