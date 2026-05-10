import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { SwipeRequest } from "@moc/contracts";
import type { AuthedRequest } from "../../common/auth.guard.js";
import { ExploreService } from "./explore.service.js";
import { ProfileBuilderService } from "./profile-builder.service.js";

@Controller("explore")
export class ExploreController {
  constructor(
    @Inject(ExploreService) private readonly service: ExploreService,
    @Inject(ProfileBuilderService)
    private readonly profileBuilder: ProfileBuilderService,
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
}
