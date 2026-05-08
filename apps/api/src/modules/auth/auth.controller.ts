import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { User, type SessionPayload } from "@moc/contracts";
import { Public } from "../../common/public.decorator.js";
import { UsersService } from "../users/users.service.js";
import { AuthService, SESSION_COOKIE_NAME, STATE_COOKIE_NAME } from "./auth.service.js";

interface StateCookiePayload {
  state: string;
  codeVerifier: string;
}

type AuthedRequest = Request & {
  user?: SessionPayload;
  cookies?: Record<string, string | undefined>;
};

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(UsersService) private readonly usersService: UsersService,
  ) {}

  @Public()
  @Get("google")
  startGoogle(@Res() res: Response): void {
    const { url, state, codeVerifier } = this.authService.startGoogleFlow();
    const cookieValue = encodeStateCookie({ state, codeVerifier });
    res.cookie(STATE_COOKIE_NAME, cookieValue, this.authService.stateCookieOptions());
    res.redirect(url);
  }

  @Public()
  @Get("google/callback")
  async googleCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ): Promise<void> {
    if (typeof code !== "string" || code.length === 0) {
      throw new BadRequestException("Missing code");
    }
    if (typeof state !== "string" || state.length === 0) {
      throw new BadRequestException("Missing state");
    }
    const cookieRaw = req.cookies?.[STATE_COOKIE_NAME];
    if (typeof cookieRaw !== "string" || cookieRaw.length === 0) {
      throw new BadRequestException("Missing state cookie");
    }
    const cookie = decodeStateCookie(cookieRaw);
    if (!cookie || cookie.state !== state) {
      throw new BadRequestException("State mismatch");
    }

    const { sessionJwt } = await this.authService.completeGoogleFlow(code, cookie.codeVerifier);

    res.clearCookie(STATE_COOKIE_NAME, this.authService.stateClearCookieOptions());
    res.cookie(SESSION_COOKIE_NAME, sessionJwt, this.authService.sessionCookieOptions());
    res.redirect(`${this.authService.webOrigin}/auth/callback`);
  }

  @Get("me")
  async me(@Req() req: AuthedRequest): Promise<User> {
    const session = req.user;
    if (!session) throw new UnauthorizedException();
    const user = await this.usersService.findById(session.uid);
    if (!user) throw new UnauthorizedException();
    return user;
  }

  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res() res: Response): void {
    res.clearCookie(SESSION_COOKIE_NAME, this.authService.sessionClearCookieOptions());
    res.send();
  }
}

function encodeStateCookie(payload: StateCookiePayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeStateCookie(raw: string): StateCookiePayload | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { state?: unknown }).state === "string" &&
      typeof (parsed as { codeVerifier?: unknown }).codeVerifier === "string"
    ) {
      const p = parsed as StateCookiePayload;
      if (p.state.length > 0 && p.codeVerifier.length > 0) return p;
    }
    return null;
  } catch {
    return null;
  }
}
