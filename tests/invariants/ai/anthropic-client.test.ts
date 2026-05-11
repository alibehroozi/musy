// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under AI-06, AI-07, AI-08.
//
// Background: the explore module's cold-start, rerank, and taste-profile
// builders all use the Anthropic SDK. The Anthropic API authenticates two
// kinds of credential differently — standard API keys via `x-api-key` and
// OAuth tokens via `Authorization: Bearer …` — and the SDK exposes those
// as separate constructor options (`apiKey` vs `authToken`). A single
// pure helper decides which option a given ANTHROPIC_API_KEY belongs in
// (AI-06), and rejects anything that isn't a recognized Anthropic
// credential shape so the bootstrap fails fast instead of silently
// falling back to seed snapshots at runtime (AI-07). When the configured
// model returns a `rate_limit_error` (observed in production with OAuth
// tokens whose subscription throttles premium models while leaving Haiku
// flowing), a pure helper picks the fallback model and the client wrapper
// retries once before bubbling the failure to the caller (AI-08).

import { describe, it, expect, vi } from "vitest";
import {
  anthropicAuthOptionsFor,
  isAnthropicRateLimitError,
  nextAnthropicModelOrNull,
  ANTHROPIC_DEFAULT_FALLBACK_MODEL,
} from "@moc/api-core";
import { AnthropicClient } from "../../../apps/api/src/modules/explore/anthropic.client.js";

// Fixtures are intentionally short — long, structurally-realistic values
// would match the gitleaks anthropic-api-key rule (`sk-ant-[a-zA-Z0-9_-]{20,}`)
// and fail CI even though they're plainly test-only. The helper only inspects
// the prefix, so trimming the tail loses no coverage.
const SAMPLE_OAUTH_TOKEN = "sk-ant-oat01-TEST";
const SAMPLE_API_KEY = "sk-ant-api03-TEST";

describe("AI-06: Anthropic SDK construction routes the configured credential by prefix", () => {
  it("OAuth tokens (sk-ant-oat01-…) go via the SDK's authToken option, not apiKey", () => {
    const opts = anthropicAuthOptionsFor(SAMPLE_OAUTH_TOKEN);
    expect(opts).toEqual({ authToken: SAMPLE_OAUTH_TOKEN });
    expect("apiKey" in opts).toBe(false);
  });

  it("standard API keys (sk-ant-api…) go via the SDK's apiKey option, not authToken", () => {
    const opts = anthropicAuthOptionsFor(SAMPLE_API_KEY);
    expect(opts).toEqual({ apiKey: SAMPLE_API_KEY });
    expect("authToken" in opts).toBe(false);
  });

  it("the routing decision depends only on its argument (no I/O, no env reads)", () => {
    const a = anthropicAuthOptionsFor(SAMPLE_OAUTH_TOKEN);
    const b = anthropicAuthOptionsFor(SAMPLE_OAUTH_TOKEN);
    expect(a).toEqual(b);

    const c = anthropicAuthOptionsFor(SAMPLE_API_KEY);
    const d = anthropicAuthOptionsFor(SAMPLE_API_KEY);
    expect(c).toEqual(d);
  });

  it("surrounding whitespace is trimmed before the prefix check (e.g. trailing newline from copy-paste)", () => {
    expect(anthropicAuthOptionsFor(`  ${SAMPLE_OAUTH_TOKEN}\n`)).toEqual({
      authToken: SAMPLE_OAUTH_TOKEN,
    });
    expect(anthropicAuthOptionsFor(` ${SAMPLE_API_KEY} `)).toEqual({
      apiKey: SAMPLE_API_KEY,
    });
  });
});

describe("AI-07: bootstrap fails fast on missing or unrecognized credential shape", () => {
  it("throws on undefined (env var not set at all)", () => {
    expect(() => anthropicAuthOptionsFor(undefined)).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("throws on empty string (ANTHROPIC_API_KEY= with no value)", () => {
    expect(() => anthropicAuthOptionsFor("")).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("throws on whitespace-only", () => {
    expect(() => anthropicAuthOptionsFor("   \t\n")).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("throws on an OpenAI-style key pasted by mistake (sk-proj-…)", () => {
    expect(() => anthropicAuthOptionsFor("sk-proj-ABCDEFGH1234")).toThrow(
      /unrecognized|invalid|shape/i,
    );
  });

  it("throws on any non-empty value that doesn't start with an Anthropic prefix", () => {
    expect(() => anthropicAuthOptionsFor("hello-world")).toThrow(/unrecognized|invalid|shape/i);
  });

  it("error message names the env var and lists both accepted shapes so the user knows what to fix", () => {
    let captured: unknown;
    try {
      anthropicAuthOptionsFor("nonsense-prefix-AAA");
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(Error);
    const msg = String(captured);
    expect(msg).toMatch(/ANTHROPIC_API_KEY/);
    expect(msg).toMatch(/sk-ant-api/);
    expect(msg).toMatch(/sk-ant-oat01/);
  });
});

// ---------------------------------------------------------------------------
// AI-08: model fallback on `rate_limit_error`.
//
// Two pure helpers + one wrapper behavior are pinned here:
//   1. `nextAnthropicModelOrNull(attempt, primary, fallback)` — selects which
//      model to use on attempt 0 vs attempt 1, returning null when there's
//      nothing left to try (e.g. primary === fallback). Pure.
//   2. `isAnthropicRateLimitError(err)` — recognizes the SDK's 429 /
//      `rate_limit_error` shape without depending on a specific class
//      identity, so SDK refactors don't silently disable the fallback.
//   3. `AnthropicClient.complete` — when the SDK's `messages.create` rejects
//      with a rate-limit-shaped error, the client retries once against the
//      fallback model and returns its text. Non-rate-limit errors propagate
//      unchanged. This is the production-observed failure mode: the
//      configured Sonnet model 429s while Haiku still works, and the
//      client must transparently recover without the caller having to know.
//
// Per AGENTS.md hard rule #15, the AnthropicClient is mocked here under the
// auth-client / spec-driven exception: a real 429 from upstream cannot be
// reliably reproduced in CI, and the failure shape is what AI-08 encodes.
// ---------------------------------------------------------------------------

describe("AI-08: nextAnthropicModelOrNull picks primary then fallback then null", () => {
  it("attempt 0 returns the primary model regardless of the fallback", () => {
    expect(nextAnthropicModelOrNull(0, "claude-sonnet-4-6", "claude-haiku-4-5")).toBe(
      "claude-sonnet-4-6",
    );
    expect(nextAnthropicModelOrNull(0, "claude-sonnet-4-6", "")).toBe("claude-sonnet-4-6");
    expect(nextAnthropicModelOrNull(0, "claude-sonnet-4-6", "claude-sonnet-4-6")).toBe(
      "claude-sonnet-4-6",
    );
  });

  it("attempt 1 returns the fallback when it differs from primary and is non-empty", () => {
    expect(nextAnthropicModelOrNull(1, "claude-sonnet-4-6", "claude-haiku-4-5")).toBe(
      "claude-haiku-4-5",
    );
  });

  it("attempt 1 returns null when fallback equals primary (no point retrying the same model)", () => {
    expect(nextAnthropicModelOrNull(1, "claude-sonnet-4-6", "claude-sonnet-4-6")).toBeNull();
  });

  it("attempt 1 returns null when the fallback is empty (fallback disabled)", () => {
    expect(nextAnthropicModelOrNull(1, "claude-sonnet-4-6", "")).toBeNull();
    expect(nextAnthropicModelOrNull(1, "claude-sonnet-4-6", "   ")).toBeNull();
  });

  it("attempt >= 2 always returns null — the wrapper retries at most once", () => {
    expect(nextAnthropicModelOrNull(2, "primary", "fallback")).toBeNull();
    expect(nextAnthropicModelOrNull(5, "primary", "fallback")).toBeNull();
  });

  it("ANTHROPIC_DEFAULT_FALLBACK_MODEL is a non-empty Haiku model alias", () => {
    expect(typeof ANTHROPIC_DEFAULT_FALLBACK_MODEL).toBe("string");
    expect(ANTHROPIC_DEFAULT_FALLBACK_MODEL.length).toBeGreaterThan(0);
    expect(ANTHROPIC_DEFAULT_FALLBACK_MODEL).toMatch(/haiku/i);
  });

  it("is pure — same inputs always produce the same output", () => {
    const a = nextAnthropicModelOrNull(1, "p", "f");
    const b = nextAnthropicModelOrNull(1, "p", "f");
    expect(a).toBe(b);
  });
});

describe("AI-08: isAnthropicRateLimitError recognizes the 429 shape", () => {
  it("recognizes errors with status === 429 (SDK APIError surface)", () => {
    expect(isAnthropicRateLimitError({ status: 429 })).toBe(true);
    expect(isAnthropicRateLimitError(Object.assign(new Error("rate limit"), { status: 429 }))).toBe(
      true,
    );
  });

  it("recognizes errors whose body type === 'rate_limit_error' even without a numeric status", () => {
    expect(
      isAnthropicRateLimitError({
        error: { error: { type: "rate_limit_error", message: "Error" } },
      }),
    ).toBe(true);
  });

  it("does NOT match non-rate-limit errors", () => {
    expect(isAnthropicRateLimitError(null)).toBe(false);
    expect(isAnthropicRateLimitError(undefined)).toBe(false);
    expect(isAnthropicRateLimitError(new Error("kaboom"))).toBe(false);
    expect(isAnthropicRateLimitError({ status: 500 })).toBe(false);
    expect(isAnthropicRateLimitError({ status: 401 })).toBe(false);
    expect(isAnthropicRateLimitError({ error: { error: { type: "overloaded_error" } } })).toBe(
      false,
    );
    expect(isAnthropicRateLimitError("string error")).toBe(false);
    expect(isAnthropicRateLimitError(429)).toBe(false);
  });
});

describe("AI-08: AnthropicClient retries once against the fallback model on rate_limit_error", () => {
  // Build a minimal SDK stub matching the surface AnthropicClient consumes.
  function makeSdk(behaviors: Array<() => unknown>) {
    let call = 0;
    const create = vi.fn(async (params: { model: string }) => {
      const idx = call++;
      const behavior = behaviors[idx];
      if (!behavior) throw new Error(`unexpected extra SDK call ${idx} model=${params.model}`);
      const result = behavior();
      if (result instanceof Error || (result && typeof result === "object" && "status" in result)) {
        throw result;
      }
      return result;
    });
    return { sdk: { messages: { create } }, create } as const;
  }

  function textResponse(text: string) {
    return {
      content: [{ type: "text" as const, text }],
    };
  }

  it("on rate_limit_error, retries with the fallback model and returns its text", async () => {
    const { sdk, create } = makeSdk([
      () => Object.assign(new Error("Anthropic 429"), { status: 429 }),
      () => textResponse("haiku result"),
    ]);
    const client = new AnthropicClient(
      sdk as unknown as ConstructorParameters<typeof AnthropicClient>[0],
      "claude-haiku-4-5-20251001",
    );

    const result = await client.complete({
      system: "sys",
      userMessage: "msg",
      model: "claude-sonnet-4-6",
      maxTokens: 32,
    });

    expect(result.text).toBe("haiku result");
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]?.[0]?.model).toBe("claude-sonnet-4-6");
    expect(create.mock.calls[1]?.[0]?.model).toBe("claude-haiku-4-5-20251001");
  });

  it("re-throws non-rate-limit errors immediately without falling back", async () => {
    const { sdk, create } = makeSdk([
      () => Object.assign(new Error("server error"), { status: 500 }),
    ]);
    const client = new AnthropicClient(
      sdk as unknown as ConstructorParameters<typeof AnthropicClient>[0],
      "claude-haiku-4-5-20251001",
    );

    await expect(
      client.complete({
        system: "sys",
        userMessage: "msg",
        model: "claude-sonnet-4-6",
        maxTokens: 32,
      }),
    ).rejects.toMatchObject({ status: 500 });

    expect(create).toHaveBeenCalledTimes(1);
  });

  it("when fallback equals primary, does not retry on rate_limit_error — surfaces the 429", async () => {
    const { sdk, create } = makeSdk([
      () => Object.assign(new Error("Anthropic 429"), { status: 429 }),
    ]);
    const client = new AnthropicClient(
      sdk as unknown as ConstructorParameters<typeof AnthropicClient>[0],
      "claude-sonnet-4-6",
    );

    await expect(
      client.complete({
        system: "sys",
        userMessage: "msg",
        model: "claude-sonnet-4-6",
        maxTokens: 32,
      }),
    ).rejects.toMatchObject({ status: 429 });

    expect(create).toHaveBeenCalledTimes(1);
  });

  it("first-attempt success on the primary model does not consume a fallback call", async () => {
    const { sdk, create } = makeSdk([() => textResponse("sonnet result")]);
    const client = new AnthropicClient(
      sdk as unknown as ConstructorParameters<typeof AnthropicClient>[0],
      "claude-haiku-4-5-20251001",
    );

    const result = await client.complete({
      system: "sys",
      userMessage: "msg",
      model: "claude-sonnet-4-6",
      maxTokens: 32,
    });

    expect(result.text).toBe("sonnet result");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]?.model).toBe("claude-sonnet-4-6");
  });

  it("if the fallback model also 429s, the final 429 bubbles up (single retry only)", async () => {
    const { sdk, create } = makeSdk([
      () => Object.assign(new Error("primary 429"), { status: 429 }),
      () => Object.assign(new Error("fallback 429"), { status: 429 }),
    ]);
    const client = new AnthropicClient(
      sdk as unknown as ConstructorParameters<typeof AnthropicClient>[0],
      "claude-haiku-4-5-20251001",
    );

    await expect(
      client.complete({
        system: "sys",
        userMessage: "msg",
        model: "claude-sonnet-4-6",
        maxTokens: 32,
      }),
    ).rejects.toMatchObject({ status: 429 });

    expect(create).toHaveBeenCalledTimes(2);
  });
});
