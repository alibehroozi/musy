// Each branch sets the unused field to explicit `null` (not undefined).
// The Anthropic SDK constructor reads `process.env.ANTHROPIC_API_KEY` /
// `ANTHROPIC_AUTH_TOKEN` for any field whose passed value is `undefined`,
// which silently smuggles a second header onto the request — observed
// in production as `401 invalid x-api-key` when an OAuth token in env
// gets auto-loaded as apiKey alongside the explicit authToken. AI-06
// requires explicit null to suppress that fallback.
export type AnthropicAuthOptions =
  | { authToken: string; apiKey: null }
  | { apiKey: string; authToken: null };

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
    return { authToken: trimmed, apiKey: null };
  }
  if (trimmed.startsWith(API_KEY_PREFIX)) {
    return { apiKey: trimmed, authToken: null };
  }
  throw new Error(
    `ANTHROPIC_API_KEY has unrecognized shape (prefix "${trimmed.slice(0, 12)}…"). ${SHAPES_DOC}`,
  );
}
