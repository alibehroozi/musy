import { z } from "zod";
import { SongSnapshot } from "./search.js";

// ── Swipe ledger (feature 03) ────────────────────────────────────────
//
// `POST /api/explore/swipe` records a Tinder-style verdict for the top
// card on the Explore tab. A right-swipe is a strong "I like this"
// signal (matches saved=8); a left-swipe stays in the ledger only.
// userId is always derived from the session — never from the body.

export const SwipeDirection = z.enum(["right", "left"]);
export type SwipeDirection = z.infer<typeof SwipeDirection>;

export const SwipeRequest = z.object({
  snapshot: SongSnapshot,
  direction: SwipeDirection,
});
export type SwipeRequest = z.infer<typeof SwipeRequest>;
