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
import { CustomMixRequest, type CustomMixCreatedResponse } from "@moc/contracts";

import type { AuthedRequest } from "../../common/auth.guard.js";
import { CustomMixService } from "./custom-mix.service.js";

/**
 * The custom-mix POST controller is mounted at `me/taste/custom-mix`
 * — the route URL belongs to the taste domain (the existing
 * `TasteController` in the taste module is `@Controller("me/taste")`
 * and owns the `GET /profile` half of that namespace). Nest allows
 * two controllers under the same path prefix as long as the leaf
 * actions don't collide; here they don't (`GET /profile` vs
 * `POST /custom-mix`).
 *
 * The controller lives in the explore module dir for the same reason
 * `BucketBuilderService` does — the DI graph (Anthropic client +
 * swipes + interest-scores + scoring) is rooted in the explore
 * module, and a TasteModule -> ExploreModule import would create a
 * cycle with the existing ExploreModule -> TasteModule import.
 */
@Controller("me/taste")
export class CustomMixController {
  constructor(@Inject(CustomMixService) private readonly service: CustomMixService) {}

  /**
   * API-26: validates the body against `CustomMixRequest` (400 on
   * schema failure), then hands off to the service. SEC-16: userId
   * comes from the session, never the body — any `userId`-shaped
   * field is silently ignored. The service's `create()` resolves
   * with `{ jobId, bucketId }` after the pre-insert; the LLM build
   * is fire-and-forget inside the service.
   */
  @Post("custom-mix")
  @HttpCode(HttpStatus.OK)
  async create(
    @Body() body: unknown,
    @Req() req: AuthedRequest,
  ): Promise<CustomMixCreatedResponse> {
    const parsed = CustomMixRequest.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    return await this.service.create({
      userId: req.user!.uid,
      promptText: parsed.data.promptText,
    });
  }
}
