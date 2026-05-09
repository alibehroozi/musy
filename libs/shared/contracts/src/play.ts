import { z } from "zod";
import { SongSnapshot } from "./search.js";

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
