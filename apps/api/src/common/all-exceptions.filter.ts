import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import { ErrorResponse } from "@moc/contracts";

const STATUS_TO_CODE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: "bad_request",
  [HttpStatus.UNAUTHORIZED]: "unauthorized",
  [HttpStatus.FORBIDDEN]: "forbidden",
  [HttpStatus.NOT_FOUND]: "not_found",
  [HttpStatus.CONFLICT]: "conflict",
  [HttpStatus.UNPROCESSABLE_ENTITY]: "unprocessable_entity",
  [HttpStatus.TOO_MANY_REQUESTS]: "rate_limited",
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const { status, code, message } = this.classify(exception);
    const body: ErrorResponse = { error: { code, message } };

    if (status >= 500) {
      this.logger.error(`${req.method} ${req.url} → ${status} ${code}`, errorStack(exception));
    } else {
      this.logger.warn(`${req.method} ${req.url} → ${status} ${code}`);
    }
    res.status(status).json(ErrorResponse.parse(body));
  }

  private classify(exception: unknown): { status: number; code: string; message: string } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const r = exception.getResponse();
      const code = STATUS_TO_CODE[status] ?? "internal_error";
      const message =
        typeof r === "string"
          ? r
          : isHttpExceptionBody(r)
            ? Array.isArray(r.message)
              ? r.message.join(", ")
              : (r.message ?? exception.message)
            : exception.message;
      return { status, code, message };
    }
    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: "validation_error",
        message: exception.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: "internal_error",
      message: "An unexpected error occurred",
    };
  }
}

function isHttpExceptionBody(r: unknown): r is { message?: string | string[]; error?: string } {
  return typeof r === "object" && r !== null;
}

function errorStack(exception: unknown): string {
  if (exception instanceof Error) return exception.stack ?? exception.message;
  return String(exception);
}
