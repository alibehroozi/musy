import { Inject, Injectable, Logger, OnModuleInit, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  decodeIdToken,
  generateCodeVerifier,
  generateState,
  Google,
  type OAuth2Tokens,
} from "arctic";
import type { CookieOptions } from "express";
import { GoogleProfile, SessionPayload, User } from "@moc/contracts";
import { UsersService } from "../users/users.service.js";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;
const GOOGLE_SCOPES = ["openid", "email", "profile"];

export const SESSION_COOKIE_NAME = "session";
export const STATE_COOKIE_NAME = "oauth_state";

export interface OAuthFlowStart {
  url: string;
  state: string;
  codeVerifier: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  private google!: Google;
  private isProduction = false;
  webOrigin = "";

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(UsersService) private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    const clientId = this.config.getOrThrow<string>("GOOGLE_CLIENT_ID");
    const clientSecret = this.config.getOrThrow<string>("GOOGLE_CLIENT_SECRET");
    const redirectURI = this.config.getOrThrow<string>("GOOGLE_REDIRECT_URI");
    this.google = new Google(clientId, clientSecret, redirectURI);
    this.isProduction = this.config.get<string>("NODE_ENV") === "production";
    const firstOrigin = this.config.getOrThrow<string>("WEB_ORIGIN").split(",")[0]?.trim();
    if (!firstOrigin) {
      throw new Error("WEB_ORIGIN must contain at least one origin");
    }
    this.webOrigin = firstOrigin;
  }

  startGoogleFlow(): OAuthFlowStart {
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = this.google.createAuthorizationURL(state, codeVerifier, GOOGLE_SCOPES);
    return { url: url.toString(), state, codeVerifier };
  }

  async completeGoogleFlow(
    code: string,
    codeVerifier: string,
  ): Promise<{ user: User; sessionJwt: string }> {
    let tokens: OAuth2Tokens;
    try {
      tokens = await this.google.validateAuthorizationCode(code, codeVerifier);
    } catch (err) {
      this.logger.warn(`Google token exchange failed: ${describe(err)}`);
      throw new UnauthorizedException("Google token exchange failed");
    }
    let claims: unknown;
    try {
      claims = decodeIdToken(tokens.idToken());
    } catch (err) {
      this.logger.warn(`Google id_token decode failed: ${describe(err)}`);
      throw new UnauthorizedException("Google id_token decode failed");
    }
    const profile = GoogleProfile.parse(claims);
    const user = await this.users.findOrCreateByGoogleProfile(profile);
    const sessionJwt = this.signSession({ uid: user.id, gid: user.googleId });
    return { user, sessionJwt };
  }

  signSession(payload: SessionPayload): string {
    return this.jwt.sign(payload);
  }

  verifySession(token: string): SessionPayload | null {
    try {
      const decoded: unknown = this.jwt.verify(token);
      return SessionPayload.parse(decoded);
    } catch {
      return null;
    }
  }

  sessionCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_MS,
    };
  }

  // Express deprecates `maxAge` on res.clearCookie — pass these instead.
  sessionClearCookieOptions(): CookieOptions {
    return { httpOnly: true, secure: this.isProduction, sameSite: "lax", path: "/" };
  }

  stateCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: STATE_TTL_MS,
    };
  }

  stateClearCookieOptions(): CookieOptions {
    return { httpOnly: true, secure: this.isProduction, sameSite: "lax", path: "/" };
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}
