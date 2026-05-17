import { CustomMixLLMOutput, type SongSnapshot } from "@moc/contracts";

import { firstJsonObjectIn } from "../explore/llm-json.js";

// Bound per AI-16. Inputs above the cap are dropped newest-first so the
// most recently-touched songs always reach the LLM.
export const MAX_CUSTOM_MIX_POOL = 400;

// Mirror of buckets.description max length (DATA-15). The LLM has
// historically emitted longer descriptions when given enough context;
// the truncation keeps the input deterministic at the prompt-cache
// layer (AI-15) without making the helper throw.
const MAX_BUCKET_DESCRIPTION_LEN = 200;

// Only these fields ever reach the prompt — direction, timestamps,
// coverUrl, userId, etc. are structurally absent (AI-14 / PRIVACY-15).
export interface CustomMixPoolSong {
  songKey: string;
  title: string;
  artist: string;
  kind: SongSnapshot["kind"];
  generalScore: number;
}

export interface CustomMixBucket {
  id: string;
  name: string;
  description: string | null;
}

export interface BuildCustomMixPromptInput {
  promptText: string;
  pool: CustomMixPoolSong[];
  buckets: CustomMixBucket[];
}

export interface BuildCustomMixPromptOutput {
  system: string;
  userMessage: string;
}

const SYSTEM_PROMPT = [
  "You are a music curator. The user has typed a free-text prompt",
  "describing the mood, vibe, or context for a custom playlist. Given",
  "their prompt, a pool of songs they have positively engaged with",
  "(right-swiped, saved, or listened to completion), and their existing",
  "auto-built bucket names, pick 10–30 songs from the pool that match",
  "the prompt's vibe and name the resulting mix.",
  "",
  "The user's identity, account, and IP are not provided and must not",
  "be invented or referenced — reason only from the listed songs, the",
  "user's prompt text, and the existing bucket names.",
  "",
  "Picking rules:",
  "- Pick only songs whose `songKey` appears in the input pool. Do not",
  "  invent songs. Picks not in the pool will be silently dropped.",
  "- Prefer songs whose `generalScore` is high — the user has ranked",
  "  them highly in their current context. Lower-scoring songs may",
  "  still fit if the prompt calls for them.",
  "- For each picked song, you may optionally name `sourceBuckets` —",
  "  the ids of the existing auto-buckets you drew the song from, used",
  "  to attribute skips later.",
  "- `initialScore`: integer 0..100 reflecting how strongly the song",
  "  fits the user's prompt (not how strongly it fits any one bucket).",
  "",
  "Naming rules:",
  "- `name`: sentence-case, ≤ 60 characters, evokes the prompt's mood.",
  "- `description`: ≤ 200 characters, one short sentence describing the",
  "  vibe in the user's words where possible.",
  "",
  "Output strictly this JSON shape — no prose, no code fences:",
  "{",
  '  "name": string,',
  '  "description": string,',
  '  "songs": [{ "songKey": string, "initialScore": number, "sourceBuckets"?: string[] }]',
  "}",
].join("\n");

function projectSong(s: CustomMixPoolSong): CustomMixPoolSong {
  return {
    songKey: s.songKey,
    title: s.title,
    artist: s.artist,
    kind: s.kind,
    generalScore: s.generalScore,
  };
}

function projectBucket(b: CustomMixBucket): {
  id: string;
  name: string;
  description: string | null;
} {
  const description =
    b.description === null
      ? null
      : b.description.length > MAX_BUCKET_DESCRIPTION_LEN
        ? b.description.slice(0, MAX_BUCKET_DESCRIPTION_LEN)
        : b.description;
  return { id: b.id, name: b.name, description };
}

/**
 * Pure helper that turns the per-build inputs into the (system, userMessage)
 * pair handed to the Anthropic SDK. Deterministic — equal inputs always
 * produce byte-identical output (AI-15). Identity-free — userId / email /
 * IP / session are not arguments and cannot leak (AI-14, PRIVACY-15).
 *
 * `pool` is expected newest-first; the helper retains the first MAX_CUSTOM_MIX_POOL
 * entries and drops the rest (AI-16). `promptText` is passed through verbatim:
 * the user controls its content, and the spec explicitly treats it as opaque
 * user input.
 */
export function buildCustomMixPrompt(input: BuildCustomMixPromptInput): BuildCustomMixPromptOutput {
  const pool = input.pool.slice(0, MAX_CUSTOM_MIX_POOL).map(projectSong);
  const buckets = input.buckets.map(projectBucket);

  const userPayload = {
    promptText: input.promptText,
    pool,
    buckets,
  };

  return {
    system: SYSTEM_PROMPT,
    userMessage: JSON.stringify(userPayload),
  };
}

/**
 * Parses the custom-mix LLM response, tolerating markdown code fences,
 * leading prose, and trailing text. Validates against CustomMixLLMOutput.
 * Throws on any failure (no JSON found, invalid JSON, schema mismatch) —
 * the caller flips the bucket to `state: "failed"` on throw; no partial
 * writes.
 */
export function parseCustomMixResponse(text: string): CustomMixLLMOutput {
  const objText = firstJsonObjectIn(text);
  if (objText === null) {
    throw new SyntaxError("no JSON object found in custom-mix response");
  }
  const json: unknown = JSON.parse(objText);
  return CustomMixLLMOutput.parse(json);
}
