// Default fallback model — picked because Anthropic OAuth-token
// subscriptions (sk-ant-oat01-…) regularly throttle Sonnet/Opus to 429
// via the unified rate-limit fallback policy while leaving Haiku
// flowing. Empirically verified against a live token: under a
// premium-model-rejected state, this Haiku alias still returned 200.
export const ANTHROPIC_DEFAULT_FALLBACK_MODEL = "claude-haiku-4-5-20251001";

export function nextAnthropicModelOrNull(
  attempt: number,
  primary: string,
  fallback: string,
): string | null {
  if (attempt === 0) return primary;
  if (attempt !== 1) return null;
  const trimmedFallback = fallback.trim();
  if (trimmedFallback.length === 0) return null;
  if (trimmedFallback === primary.trim()) return null;
  return trimmedFallback;
}

export function isAnthropicRateLimitError(err: unknown): boolean {
  if (err === null || typeof err !== "object") return false;
  const e = err as {
    status?: unknown;
    error?: { error?: { type?: unknown } };
  };
  if (e.status === 429) return true;
  const innerType = e.error?.error?.type;
  if (typeof innerType === "string" && innerType === "rate_limit_error") return true;
  return false;
}
