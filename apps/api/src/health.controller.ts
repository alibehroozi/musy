import { Controller, Get } from "@nestjs/common";
import { Public } from "./common/public.decorator.js";

@Controller("health")
@Public()
export class HealthController {
  @Get()
  check(): { status: "ok" } {
    return { status: "ok" };
  }
}
