import { z } from "zod";
import { Email, GoogleId, UserId } from "./users.js";

// Subset of Google's userinfo / id_token claims we care about.
// `sub` is Google's stable per-user identifier; we store it as User.googleId.
export const GoogleProfile = z.object({
  sub: GoogleId,
  email: Email,
  email_verified: z.boolean().optional(),
  name: z.string().min(1).optional(),
  picture: z.string().url().optional(),
});
export type GoogleProfile = z.infer<typeof GoogleProfile>;

// Payload signed into the session JWT. Kept small: a forged JWT that
// somehow validated must still match an existing user record.
export const SessionPayload = z.object({
  uid: UserId,
  gid: GoogleId,
});
export type SessionPayload = z.infer<typeof SessionPayload>;
