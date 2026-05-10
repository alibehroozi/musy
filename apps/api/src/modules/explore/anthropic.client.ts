import { Inject, Injectable } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";

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

/**
 * Thin wrapper around @anthropic-ai/sdk so the rest of the app injects
 * a stable surface (string in, string out). Keeps the SDK out of services
 * that only need text completions, and makes the call site mockable for
 * the 5xx-failure-mode test (per AGENTS.md hard rule #15 exception).
 */
@Injectable()
export class AnthropicClient {
  constructor(@Inject(ANTHROPIC_SDK_TOKEN) private readonly sdk: Anthropic) {}

  async complete(req: AnthropicMessageRequest): Promise<AnthropicMessageResponse> {
    const response = await this.sdk.messages.create({
      model: req.model,
      max_tokens: req.maxTokens,
      system: [
        {
          type: "text",
          text: req.system,
          // Cache the system prompt — it's identical across users
          // because buildTastePrompt is identity-free (AI-02).
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
  }
}
