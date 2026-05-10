import {
  fetchNext as fetchNextCore,
  fetchProfile as fetchProfileCore,
  submitSwipe as submitSwipeCore,
} from "@moc/web-core";
import type {
  NextResponse,
  TasteProfileResponse,
  SongSnapshot,
  SwipeDirection,
} from "@moc/contracts";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

export function fetchNext(count: number): Promise<NextResponse> {
  return fetchNextCore(count, API_BASE);
}

export function fetchProfile(): Promise<TasteProfileResponse> {
  return fetchProfileCore(API_BASE);
}

export function submitSwipe(snapshot: SongSnapshot, direction: SwipeDirection): Promise<void> {
  return submitSwipeCore(snapshot, direction, API_BASE);
}
