import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/**
 * Mark a route handler (or controller) as public — opts out of the global
 * AuthGuard. Use sparingly; the default is auth-required.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
