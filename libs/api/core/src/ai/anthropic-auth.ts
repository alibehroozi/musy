export type AnthropicAuthOptions = { apiKey: string } | { authToken: string };

const OAUTH_TOKEN_PREFIX = "sk-ant-oat01-";
const API_KEY_PREFIX = "sk-ant-api";

const SHAPES_DOC =
  "Expected sk-ant-api… (API key from console.anthropic.com) " +
  "or sk-ant-oat01-… (OAuth token, e.g. issued by `claude setup-token`).";

export function anthropicAuthOptionsFor(rawKey: string | null | undefined): AnthropicAuthOptions {
  const trimmed = (rawKey ?? "").trim();
  if (trimmed.length === 0) {
    throw new Error(`ANTHROPIC_API_KEY is not set. Set it in apps/api/.env.local. ${SHAPES_DOC}`);
  }
  if (trimmed.startsWith(OAUTH_TOKEN_PREFIX)) {
    return { authToken: trimmed };
  }
  if (trimmed.startsWith(API_KEY_PREFIX)) {
    return { apiKey: trimmed };
  }
  throw new Error(
    `ANTHROPIC_API_KEY has unrecognized shape (prefix "${trimmed.slice(0, 12)}…"). ${SHAPES_DOC}`,
  );
}
