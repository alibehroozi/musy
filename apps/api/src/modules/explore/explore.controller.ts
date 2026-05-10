import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import type { NextResponse } from "@moc/contracts";
import { SwipeRequest } from "@moc/contracts";
import type { AuthedRequest } from "../../common/auth.guard.js";
import { ExploreService } from "./explore.service.js";
import { ProfileBuilderService } from "./profile-builder.service.js";
import { QueueBuilderService } from "./queue-builder.service.js";

@Controller("explore")
export class ExploreController {
  constructor(
    @Inject(ExploreService) private readonly service: ExploreService,
    @Inject(ProfileBuilderService)
    private readonly profileBuilder: ProfileBuilderService,
    @Inject(QueueBuilderService)
    private readonly queueBuilder: QueueBuilderService,
  ) {}

  @Post("swipe")
  @HttpCode(HttpStatus.NO_CONTENT)
  async swipe(@Body() body: unknown, @Req() req: AuthedRequest): Promise<void> {
    const parsed = SwipeRequest.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    // SEC-09: userId comes from the session, never from the body.
    await this.service.recordSwipe({
      userId: req.user!.uid,
      snapshot: parsed.data.snapshot,
      direction: parsed.data.direction,
    });
  }

  /**
   * SEC-10: scope by the session's uid. The body is JSON `null` (literal)
   * when the user has no profile yet — Nest's default null-return path
   * sends an empty body, which would not parse as `TasteProfileResponse`.
   * Stringify explicitly so the wire format matches the contract.
   */
  @Get("profile")
  async profile(@Req() req: AuthedRequest, @Res() res: Response): Promise<void> {
    const profile = await this.profileBuilder.getProfile(req.user!.uid);
    res.status(HttpStatus.OK).type("application/json").send(JSON.stringify(profile));
  }

  /**
   * SEC-11 / API-16: scope by the session's uid; never trust a body or
   * query userId. `count` is parsed as a positive integer; the service
   * clamps to [1, 50] and defaults to 20.
   */
  @Get("next")
  async next(
    @Req() req: AuthedRequest,
    @Query("count") countParam?: string,
  ): Promise<NextResponse> {
    const count = parseCount(countParam);
    return await this.queueBuilder.getNext(req.user!.uid, count);
  }
}

const DEFAULT_COUNT = 20;

function parseCount(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_COUNT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return DEFAULT_COUNT;
  return n;
}
