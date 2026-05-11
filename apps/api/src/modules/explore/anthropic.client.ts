import { Inject, Injectable } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import {
  ANTHROPIC_DEFAULT_FALLBACK_MODEL,
  isAnthropicRateLimitError,
  nextAnthropicModelOrNull,
} from "@moc/api-core";

export interface AnthropicMessageRequest {
  system: string;
  userMessage: string;
  model: string;
  maxTokens: number;
}

export interface AnthropicMessageResponse {
  text: string;
}

export const ANTHROPIC_SDK_TOKEN = "ANTHROPIC_SDK";
export const ANTHROPIC_FALLBACK_MODEL_TOKEN = "ANTHROPIC_FALLBACK_MODEL";

@Injectable()
export class AnthropicClient {
  constructor(
    @Inject(ANTHROPIC_SDK_TOKEN) private readonly sdk: Anthropic,
    @Inject(ANTHROPIC_FALLBACK_MODEL_TOKEN) private readonly fallbackModel: string,
  ) {}

  async complete(req: AnthropicMessageRequest): Promise<AnthropicMessageResponse> {
    let lastErr: unknown = null;
    for (let attempt = 0; ; attempt++) {
      const model = nextAnthropicModelOrNull(attempt, req.model, this.fallbackModel);
      if (model === null) {
        throw lastErr ?? new Error("Anthropic call exhausted retries with no error captured");
      }
      try {
        const response = await this.sdk.messages.create({
          model,
          max_tokens: req.maxTokens,
          system: [
            {
              type: "text",
              text: req.system,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [{ role: "user", content: req.userMessage }],
        });

        const textBlock = response.content.find((b) => b.type === "text");
        if (!textBlock || textBlock.type !== "text") {
          throw new Error("Anthropic response contained no text block");
        }
        return { text: textBlock.text };
      } catch (err) {
        lastErr = err;
        if (!isAnthropicRateLimitError(err)) throw err;
      }
    }
  }
}

export { ANTHROPIC_DEFAULT_FALLBACK_MODEL };
