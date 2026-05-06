import { z } from "zod";

export const UserId = z.string().uuid();
export type UserId = z.infer<typeof UserId>;

export const Email = z.string().trim().toLowerCase().email().max(254);
export type Email = z.infer<typeof Email>;

export const User = z.object({
  id: UserId,
  email: Email,
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof User>;
