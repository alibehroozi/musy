// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under AI-06, AI-07.
//
// Background: the explore module's cold-start, rerank, and taste-profile
// builders all use the Anthropic SDK. The Anthropic API authenticates two
// kinds of credential differently — standard API keys via `x-api-key` and
// OAuth tokens via `Authorization: Bearer …` — and the SDK exposes those
// as separate constructor options (`apiKey` vs `authToken`). A single
// pure helper decides which option a given ANTHROPIC_API_KEY belongs in
// (AI-06), and rejects anything that isn't a recognized Anthropic
// credential shape so the bootstrap fails fast instead of silently
// falling back to seed snapshots at runtime (AI-07).

import { describe, it, expect } from "vitest";
import { anthropicAuthOptionsFor } from "@moc/api-core";

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
