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
});

export const PlayStartedRequest = PlayEventBodyBase;
export type PlayStartedRequest = z.infer<typeof PlayStartedRequest>;

export const PlayCompletedRequest = PlayEventBodyBase.extend({
  elapsedMs: z.number().int().nonnegative(),
});
export type PlayCompletedRequest = z.infer<typeof PlayCompletedRequest>;
