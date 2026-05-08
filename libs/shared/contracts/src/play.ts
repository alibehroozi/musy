import { z } from "zod";

export const SongSnapshot = z.object({
  title: z.string().min(1),
  artist: z.string().min(1),
  kind: z.enum(["track", "station"]),
  coverUrl: z.string().url().optional(),
  year: z.number().int().positive().optional(),
  durationSec: z.number().positive().optional(),
});
export type SongSnapshot = z.infer<typeof SongSnapshot>;

export const ResolveRequest = z.object({
  snapshot: SongSnapshot,
});
export type ResolveRequest = z.infer<typeof ResolveRequest>;

export const ResolveSource = z.enum(["audius", "soundcloud"]).nullable();
export type ResolveSource = z.infer<typeof ResolveSource>;

export const ResolveResponse = z.object({
  source: ResolveSource,
  sourceTrackId: z.string().nullable(),
  streamUrl: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
});
export type ResolveResponse = z.infer<typeof ResolveResponse>;

export const PlayEventSource = z.enum(["audius", "soundcloud", "radio-browser"]);
export type PlayEventSource = z.infer<typeof PlayEventSource>;

export const PlayStartedRequest = z.object({
  source: PlayEventSource,
  externalId: z.string().min(1),
  snapshot: SongSnapshot,
});
export type PlayStartedRequest = z.infer<typeof PlayStartedRequest>;

export const PlayCompletedRequest = z.object({
  source: PlayEventSource,
  externalId: z.string().min(1),
  snapshot: SongSnapshot,
  elapsedMs: z.number().int().nonnegative(),
});
export type PlayCompletedRequest = z.infer<typeof PlayCompletedRequest>;
