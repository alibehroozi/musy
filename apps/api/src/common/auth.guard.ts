import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { SessionPayload } from "@moc/contracts";
import { AuthService } from "../modules/auth/auth.service.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";

export type AuthedRequest = Request & {
  user?: SessionPayload;
  cookies?: Record<string, string | undefined>;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = req.cookies?.["session"];

    // Always try to populate req.user when a session cookie is present so that
    // @Public() routes can optionally inspect it (e.g. POST /search history upsert).
    if (typeof token === "string" && token.length > 0) {
      const payload = this.authService.verifySession(token);
      if (payload) req.user = payload;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    if (!req.user) throw new UnauthorizedException();
    return true;
  }
}
