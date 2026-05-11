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
  try {
    const parsed = JSON.parse(text) as { songs?: unknown };
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
  } catch {
    return [];
  }
}
