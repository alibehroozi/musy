import { BucketBuilderLLMOutput, type SongSnapshot } from "@moc/contracts";

import { firstJsonObjectIn } from "../explore/llm-json.js";

// Bound per AI-13. Inputs above the cap are dropped newest-first.
//
// The cap is small (20) because the bucket-builder is an INCREMENTAL worker
// (LOGIC-38): each run only ever considers songs the LLM has not yet
// bucketed for this user, so a per-run pool of 20 is a worst-case bound.
// Keeping the output JSON small also keeps the LLM well below its
// `max_tokens` cap — the previous value (300) let Sonnet truncate the
// response mid-object and surface as
// `auto_bucket_build_failed reason=llm_parse_failed`.
export const MAX_BUCKET_SONGS = 20;

// Only these snapshot fields ever reach the prompt — direction, timestamps,
// coverUrl, userId, etc. are structurally absent (AI-11 / PRIVACY-14).
export interface PromptSong {
  songKey: string;
  title: string;
  artist: string;
  kind: SongSnapshot["kind"];
}

export interface ExistingBucket {
  name: string;
  description: string | null;
}

export interface BuildBucketPromptInput {
  recentSongs: PromptSong[];
  existingBuckets: ExistingBucket[];
}

export interface BuildBucketPromptOutput {
  system: string;
  userMessage: string;
}

const SYSTEM_PROMPT = [
  "You are a music curator. Given a user's recent positive-signal songs",
  "(right-swiped, saved, or listened to completion) and their existing",
  "bucket names, classify the songs into named mood/genre buckets.",
  "",
  "The user's identity, account, and IP are not provided and must not",
  "be invented or referenced — reason only from the listed songs and",
  "existing bucket names.",
  "",
  "Naming rules:",
  "- Bucket names: sentence-case, ≤ 60 characters, concise and evocative.",
  "- Bucket descriptions: ≤ 200 characters, describe the vibe briefly.",
  "- Reuse existing bucket names when a song fits — total buckets per",
  "  user should stay ≤ 30. Only invent a new bucket when no existing",
  "  one fits the songs.",
  "- A song may appear in multiple assignments (one per bucket it fits).",
  "- initialScore: integer 0..100 reflecting how strongly the song fits",
  "  the bucket. Omit a song from assignments if it does not fit any bucket.",
  "",
  "Output strictly this JSON shape — no prose, no code fences:",
  "{",
  '  "newBuckets": [{ "name": string, "description": string }],',
  '  "assignments": [{ "songKey": string, "bucket": string, "initialScore": number }]',
  "}",
].join("\n");

function projectSong(s: PromptSong): PromptSong {
  return { songKey: s.songKey, title: s.title, artist: s.artist, kind: s.kind };
}

/**
 * Pure helper that turns the per-build inputs into the (system, userMessage)
 * pair handed to the Anthropic SDK. Deterministic — equal inputs always
 * produce byte-identical output (AI-12). Identity-free — userId / email /
 * IP / session are not arguments and cannot leak (AI-11, PRIVACY-14).
 *
 * Inputs are expected newest-first; the helper retains the first MAX_BUCKET_SONGS
 * entries and drops the rest (AI-13).
 */
export function buildBucketPrompt(input: BuildBucketPromptInput): BuildBucketPromptOutput {
  const recentSongs = input.recentSongs.slice(0, MAX_BUCKET_SONGS).map(projectSong);
  const existingBuckets = input.existingBuckets.map((b) => ({
    name: b.name,
    description: b.description,
  }));

  const userPayload = { recentSongs, existingBuckets };

  return {
    system: SYSTEM_PROMPT,
    userMessage: JSON.stringify(userPayload),
  };
}

/**
 * Parses the bucket-builder LLM response, tolerating markdown code fences,
 * leading prose, and trailing text. Validates against BucketBuilderLLMOutput.
 * Throws on any failure (no JSON found, invalid JSON, schema mismatch) —
 * the caller logs and aborts on parse failure; no partial writes.
 */
export function parseBucketBuilderResponse(text: string): BucketBuilderLLMOutput {
  const objText = firstJsonObjectIn(text);
  if (objText === null) {
    throw new SyntaxError("no JSON object found in bucket-builder response");
  }
  const json: unknown = JSON.parse(objText);
  return BucketBuilderLLMOutput.parse(json);
}
