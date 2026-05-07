import { User } from "@moc/contracts";
import { fetchJson } from "@moc/web-core";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

/** GET /api/auth/me — returns the parsed User, throws HttpError on non-2xx. */
export function fetchMe(): Promise<User> {
  return fetchJson(`${API_BASE}/auth/me`, User, { credentials: "include" });
}

/** Top-level navigation that begins the Google OAuth flow on the API. */
export const GOOGLE_LOGIN_URL = `${API_BASE}/auth/google`;
