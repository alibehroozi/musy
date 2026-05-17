import { z } from "zod";
import { ProviderName, SongSnapshot } from "./search.js";

export const ResolveSource = z.enum(["audius", "soundcloud"]);
export type ResolveSource = z.infer<typeof ResolveSource>;

export const ResolveRequest = z.object({
  snapshot: SongSnapshot,
});
export type ResolveRequest = z.infer<typeof ResolveRequest>;

export const ResolveResponse = z.object({
  source: ResolveSource.nullable(),
  sourceTrackId: z.string().nullable(),
  streamUrl: z.string().url().nullable(),
  expiresAt: z.string().datetime().nullable(),
});
export type ResolveResponse = z.infer<typeof ResolveResponse>;

// ── Bad-Remix re-resolution (UI-32, API-22, API-23, DATA-14) ─────────
//
// `POST /play/reresolve` lets an authenticated caller mark the current
// SoundCloud resolution of a song as "wrong" and rotate to the next
// candidate. The server persists each chosen track in
// `resolution_preferences` with a score = (current max for this hash) + 1
// so the most-recent click always wins on subsequent `/play/resolve` calls.

export const ReresolveRequest = z.object({
  snapshot: SongSnapshot,
  // Whatever sourceTrackId is currently playing on the client (any provider).
  // Combined with the existing rows of `resolution_preferences` for this hash,
  // it forms the picker's exclude-set. Required so the very first click on
  // a song with no preference history still rotates to a different track.
  currentSourceTrackId: z.string().min(1),
});
export type ReresolveRequest = z.infer<typeof ReresolveRequest>;

export const ReresolveResponse = ResolveResponse;
export type ReresolveResponse = z.infer<typeof ReresolveResponse>;

// ── Listening events (feature 02) ─────────────────────────────────────
//
// `POST /play/started` and `POST /play/completed` record raw audio
// events to `listening_events` and bump the matching `interest_scores`
// document via the pure max-rule. The request body never carries a
// userId — the server always derives it from the session.

export const PlayEventType = z.enum(["started", "completed"]);
export type PlayEventType = z.infer<typeof PlayEventType>;

const PlayEventBodyBase = z.object({
  source: ProviderName,
  externalId: z.string().min(1),
  snapshot: SongSnapshot,
  // Present when the play originated inside a bucket (feature 06).
  // Both fields must be null together or non-null together (DATA-21).
  bucketId: z.string().uuid().nullable().optional(),
  bucketKind: z.enum(["auto", "custom"]).nullable().optional(),
});

export const PlayStartedRequest = PlayEventBodyBase;
export type PlayStartedRequest = z.infer<typeof PlayStartedRequest>;

export const PlayCompletedRequest = PlayEventBodyBase.extend({
  elapsedMs: z.number().int().nonnegative(),
});
export type PlayCompletedRequest = z.infer<typeof PlayCompletedRequest>;
