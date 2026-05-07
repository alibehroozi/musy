import { z } from "zod";

export const UserId = z.string().uuid();
export type UserId = z.infer<typeof UserId>;

export const Email = z.string().trim().toLowerCase().email().max(254);
export type Email = z.infer<typeof Email>;

export const GoogleId = z.string().min(1).max(255);
export type GoogleId = z.infer<typeof GoogleId>;

export const User = z.object({
  id: UserId,
  email: Email,
  googleId: GoogleId,
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof User>;
