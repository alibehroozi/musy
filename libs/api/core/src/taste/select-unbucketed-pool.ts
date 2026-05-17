import type { PromptSong } from "./bucket-prompt.js";

export type { PromptSong };

export interface SelectUnbucketedPoolInput {
  pool: PromptSong[];
  scoredSongKeys: Set<string>;
  cap?: number;
}

const DEFAULT_CAP = 20;

/**
 * LOGIC-38. Pure helper that drives the auto-bucket builder's incremental
 * policy: given a newest-first ordered `pool` of positive-signal songs and
 * the set of songKeys already present in the user's `bucket_song_scores`
 * collection, returns the first `cap` entries (default 20) whose songKey
 * is NOT in `scoredSongKeys`. Order is preserved; filtered entries do not
 * consume the cap.
 *
 * Replaces the prior "send the user's entire positive-signal history every
 * time" approach (capped at 300) which let the LLM truncate the response
 * JSON at `max_tokens` once accumulated signals grew past ~60 songs.
 */
export function selectUnbucketedPool(input: SelectUnbucketedPoolInput): PromptSong[] {
  const cap = input.cap ?? DEFAULT_CAP;
  const out: PromptSong[] = [];
  for (const song of input.pool) {
    if (out.length >= cap) break;
    if (input.scoredSongKeys.has(song.songKey)) continue;
    out.push(song);
  }
  return out;
}
