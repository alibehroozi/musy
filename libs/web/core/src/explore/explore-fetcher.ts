import {
  NextResponse,
  TasteProfileResponse,
  SwipeRequest,
  type SwipeDirection,
  type SongSnapshot,
  type NextResponse as NextResponseT,
  type TasteProfileResponse as TasteProfileResponseT,
} from "@moc/contracts";
import { fetchJson, HttpError } from "../fetcher.js";

/** GET /api/explore/next?count=N — validates against NextResponse Zod schema. */
export function fetchNext(count: number, apiBase = "/api"): Promise<NextResponseT> {
  const clamped = Math.max(1, Math.min(50, Math.trunc(count)));
  return fetchJson(`${apiBase}/explore/next?count=${clamped}`, NextResponse, {
    method: "GET",
  });
}

/** GET /api/explore/profile — validates against TasteProfileResponse Zod schema. */
export function fetchProfile(apiBase = "/api"): Promise<TasteProfileResponseT> {
  return fetchJson(`${apiBase}/explore/profile`, TasteProfileResponse, {
    method: "GET",
  });
}

/** POST /api/explore/swipe — body parsed against SwipeRequest before send (no response body). */
export async function submitSwipe(
  snapshot: SongSnapshot,
  direction: SwipeDirection,
  apiBase = "/api",
): Promise<void> {
  const body = SwipeRequest.parse({ snapshot, direction });
  const res = await fetch(`${apiBase}/explore/swipe`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new HttpError(res.status, res.statusText, `${apiBase}/explore/swipe`);
  }
}
