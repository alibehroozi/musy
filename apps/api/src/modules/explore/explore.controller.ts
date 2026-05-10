import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
} from "@nestjs/common";
import { SwipeRequest } from "@moc/contracts";
import type { AuthedRequest } from "../../common/auth.guard.js";
import { ExploreService } from "./explore.service.js";

@Controller("explore")
export class ExploreController {
  constructor(@Inject(ExploreService) private readonly service: ExploreService) {}

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
}
