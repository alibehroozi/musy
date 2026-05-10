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
import { PlayCompletedRequest, PlayStartedRequest } from "@moc/contracts";
import type { AuthedRequest } from "../../common/auth.guard.js";
import { PlayEventsService } from "./play-events.service.js";

@Controller("play")
export class PlayEventsController {
  constructor(@Inject(PlayEventsService) private readonly events: PlayEventsService) {}

  @Post("started")
  @HttpCode(HttpStatus.NO_CONTENT)
  async started(@Body() body: unknown, @Req() req: AuthedRequest): Promise<void> {
    const parsed = PlayStartedRequest.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    await this.events.record({
      userId: req.user!.uid,
      source: parsed.data.source,
      externalId: parsed.data.externalId,
      snapshot: parsed.data.snapshot,
      elapsedMs: 0,
      eventType: "started",
    });
  }

  @Post("completed")
  @HttpCode(HttpStatus.NO_CONTENT)
  async completed(@Body() body: unknown, @Req() req: AuthedRequest): Promise<void> {
    const parsed = PlayCompletedRequest.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    await this.events.record({
      userId: req.user!.uid,
      source: parsed.data.source,
      externalId: parsed.data.externalId,
      snapshot: parsed.data.snapshot,
      elapsedMs: parsed.data.elapsedMs,
      eventType: "completed",
    });
  }
}
