// Number of songs Claude is asked to generate for a brand-new user.
export const COLD_START_COUNT = 30;

// Kept short so it fits in a single prompt-cache entry.
const SYSTEM_PROMPT = [
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

export interface ColdStartSuggestion {
  title: string;
  artist: string;
}

export function buildColdStartPrompt(): { system: string; userMessage: string } {
  return {
    system: SYSTEM_PROMPT,
    userMessage: `Generate ${COLD_START_COUNT} diverse songs for a new user's music discovery experience.`,
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

/**
 * Locates the first balanced `{ … }` object in `text` and returns its
 * exact substring (including the outer braces), or `null` if none.
 *
 * Skips leading prose, markdown code fences, and any text outside the
 * object; tracks string state and escape sequences so braces inside
 * string values do not affect nesting depth. Pure — same input always
 * produces the same output, no I/O, no globals.
 */
function firstJsonObjectIn(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
