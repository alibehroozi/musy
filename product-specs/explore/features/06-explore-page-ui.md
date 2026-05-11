---
epic: explore
status: done
estimated-invariants: 8
implemented-in-pr: https://github.com/alibehroozi/musy/pull/27
---

# Feature 06: Explore page UI

## Product description

The Explore tab — `/explore` — finally fills its placeholder with the Tinder-style swipe stack. A logged-in user lands on the page; the current top card auto-plays the track preview using the existing `PlayerProvider`. The user swipes right (or taps ♥) to like / left (or taps ✕) to pass. Each swipe fires `POST /api/explore/swipe`, animates the card off-screen, and slides the next card to top — at which point its preview auto-starts. The action row also has a ⏸ play / pause toggle that controls the preview without affecting card state.

A phase pill in the topbar reflects the user's current explore phase ("Discovering taste" → "Finding artists" → no pill once personalized). On first visit, an onboarding overlay covers the first card with a one-tap "Got it" dismiss; the dismissal is per-device (localStorage flag).

When the queue dips below 5 items, the FE triggers a background refill via `GET /api/explore/next`; the user generally never notices. If a refill fails or the queue is genuinely empty, the page renders the refilling state — three-dot animation + "Inspired by your taste" caption + a "Try again" button after 10 s.

The mini-player from the playback epic gets one new behavior: when the currently-playing track matches the top of the explore queue (i.e. the card _is_ the player surface), the docked mini-player is hidden. Navigating away to `/taste` or `/search` mid-preview restores the mini-player at its docked position.

## User behavior

1. Logged-in user opens `/explore`. Logged-out hits the existing redirect-to-sign-in flow (no special handling needed).
2. **First visit** — onboarding overlay covers the first card. User taps "Got it"; localStorage flag set; future visits skip the overlay.
3. The top card's artwork / title / artist are shown. The card's inline scrubber animates as the preview plays.
4. **Right-swipe** (drag past threshold or tap ♥): card animates off-screen-right with rotation; meanwhile `POST /swipe { direction: "right" }` fires; the next card snaps to top with the next track's preview auto-starting.
5. **Left-swipe** (drag past threshold or tap ✕): card animates off-screen-left; `POST /swipe { direction: "left" }`; next card moves up.
6. **Pause** (tap ⏸): preview pauses without affecting card position. Tapping again resumes.
7. Below 5 items left in the FE queue → background refill. Below 1 → render the refilling state.
8. Preview won't load (provider 404) → auto-skip after 5 s (no swipe event written; tracked client-side as `unresolvable`).
9. Network offline → refilling state.
10. Phase pill copy: read user's current phase from `GET /api/explore/profile` on page mount and after each refill; render as a small pill in the topbar with one of "Discovering taste" / "Finding artists" / hidden.

**Failure modes the user can reach:**

- Anonymous user → redirected to sign-in (existing AuthGuard pattern; no new code).
- API down → refilling state with retry button.
- Single provider failure → not user-visible; the queue still has candidates from the other provider.
- Preview unresolvable → silently skip after 5 s.
- Onboarding dismissed-then-cleared (e.g. localStorage purge) → overlay re-appears on next visit. Acceptable.

**Empty / first-run state:** onboarding overlay (state 04 in mockups). After dismissal, behaves as state 01.

## Design

**Visual mockup (4 states):**

- Default: [`../design/01-default.html`](../design/01-default.html) — top card, scrubber playing, action row, next card peeking
- Mid-swipe-right: [`../design/02-mid-swipe-right.html`](../design/02-mid-swipe-right.html) — top card translated / rotated, LIKE stamp, like button highlighted
- Refilling: [`../design/03-refilling.html`](../design/03-refilling.html) — empty state, three dots, "Inspired by your taste", retry button after 10 s
- Onboarding: [`../design/04-onboarding.html`](../design/04-onboarding.html) — welcome overlay covering the first card

The Playwright `toHaveScreenshot` baselines added during `/new-feature` lock these in.

**DS components used:** `Card`, `IconButton` (both from feature 1), `Typography`, `Button`, `BottomNav`, `Icon`.

**DS components required but missing:** none, assuming feature 1 has landed.

**Layout notes:**

- Topbar: 48 px, `Typography` h3 + phase pill (small, `border-border`, `text-text-muted`).
- Card stack area: flex-1 with `padding: var(--spacing-4)`; each card is `position: absolute; top: 0; bottom: 0; left/right: spacing-4` so a card never overflows into the action row regardless of artwork aspect.
- Card artwork: `flex: 1; min-height: 0;` — absorbs leftover vertical space.
- "Behind" card: `transform: scale(0.94) translateY(10px); opacity: 0.55;` and a subtle blur. During swipe, the behind card scales toward 1.
- Action row: 80 px, three `IconButton lg` with `aria-label` only — **no text labels** (per design review).
- LIKE stamp during right-swipe past threshold: `border-success`, `text-success`, rotated `-12deg`, top-left of the artwork.

## Backend

This is a frontend-only feature. The endpoints used (`POST /swipe`, `GET /next`, `GET /profile`) are all from features 3–5. No new endpoints, no new collections, no new env vars.

## Tooling

**New deps:**

- **`framer-motion` v12** (MIT) — drag + spring + rotation primitives; reusable for any later motion work. Considered: `react-tinder-card` (3 KB MIT but unmaintained — last release > 2 y, thin wrapper), pointer-events from scratch (zero deps but a week of polish; spring / snap maths is annoying).

**External services:** none new.

## Privacy

What data crosses which boundary:

- User → API: swipe events (covered by feature 3), queue fetches (feature 5), profile fetches (feature 4).
- API → third party: none new.
- API → LLM prompt: none new.
- Stays server-only: same as previous features.

The FE's localStorage hosts only the onboarding-dismissed flag (`moc.explore.onboarded` = `"1"`) — no per-user identifiers, no swipe history.

## Acceptance criteria

- [ ] `/explore` renders the swipe stack for logged-in users; logged-out users redirect via the existing AuthGuard.
- [ ] First visit shows the onboarding overlay; tapping "Got it" dismisses it and sets the localStorage flag; second visit does not show it.
- [ ] Top card's preview auto-plays when the card mounts; pausing via ⏸ stops audio without changing card state.
- [ ] Right-swipe (drag past threshold) animates off-screen, fires `POST /swipe { direction: "right" }`, and the next card moves to top with its preview auto-starting.
- [ ] Tapping ♥ produces the same effect as a right-swipe; tapping ✕ produces the same effect as a left-swipe.
- [ ] When the queue dips below 5, a background `GET /next` fires; the user does not see a loading state.
- [ ] When the queue is empty AND a refill returns no items, the refilling state is rendered; "Try again" appears after 10 s.
- [ ] When `currentTrack === topCard.snapshot`, the docked mini-player is **not** rendered on `/explore` (the card owns the player surface).
- [ ] Navigating to `/taste` while the preview is playing → mini-player appears at the docked position with the correct track.
- [ ] Phase pill renders "Discovering taste", "Finding artists", or is absent based on `profile.phase`.
- [ ] All four mockup states pass Playwright `toHaveScreenshot` and `expectAccessible(page)` (per AGENTS.md hard rules #12 and #13).
- [ ] Touch targets on the IconButtons meet the 44×44 px minimum (verified per `BROWSER-XX`).

## Suggested invariants

The agent in `/new-invariant` will refine these — they're seeds, not commitments:

- **UI-XX:** When the player's `currentTrack.snapshot` is identical (by snapshot hash) to the top of the explore queue and the user is on `/explore`, the docked mini-player is **not** rendered. On any other route, the mini-player follows the existing `UI-11` rules.
- **UI-XX:** On first visit to `/explore`, the onboarding overlay (`role="dialog"`, `aria-modal="true"`) is rendered above the top card; after the user dismisses it, `localStorage["moc.explore.onboarded"] === "1"` and subsequent visits do not render the overlay.
- **UI-XX:** The phase pill in the Explore topbar contains the literal text "Discovering taste" when `profile.phase === "discovery"`, "Finding artists" when `"artist-refinement"`, and is absent (no element) when `"personalized"`.
- **UI-XX:** On `/explore`, exactly one card has `data-explore-position="top"` at any time; tapping ♥ or ✕ removes that attribute and applies it to the next card.
- **LOGIC-XX (web-core):** A pure helper `directionFromDrag({ dx, dy, threshold }) → "right" | "left" | null` is deterministic and total: `dx >= threshold` → `"right"`, `dx <= -threshold` → `"left"`, else `null`.
- **BROWSER-XX:** On 375×667 viewport, each `IconButton` in the Explore action row has a touch target ≥ 44×44 px and the row itself fits within 80 px height without horizontal scroll.
- **BROWSER-XX:** On 375×667 viewport, the explore card stack fits without horizontal scroll, the artwork area is at least 240×240 px, and the LIKE / PASS stamp during a swipe-past-threshold drag does not occlude the title or artist text.
- **BROWSER-XX:** All four mockup-derived states (`default`, `mid-swipe-right`, `refilling`, `onboarding`) pass `expectAccessible(page)` (axe-core WCAG AA — contrast, labels, ARIA).

## Implementation hint for /new-feature

This file is self-contained.

**Where things live (per ARCHITECTURE.md layering):**

- Pure logic in `libs/web/core/explore/`:
  - `direction-from-drag.ts` + test — `directionFromDrag({ dx, dy, threshold })`.
  - `swipe-fetcher.ts` + test — `submitSwipe(snapshot, direction, apiBase)` validates against the contract Zod schema (mirrors the `searchTracks` / `resolveAndPlay` pattern from `LOGIC-04` / `LOGIC-09`).
  - `next-fetcher.ts` + test — `fetchNext(count, apiBase)`.
  - `profile-fetcher.ts` + test.
- React feature in `apps/web/src/features/explore/`:
  - `ExplorePage.tsx`
  - `components/CardStack.tsx` — owns drag handling, framer-motion `motion.div`, threshold + snap + rotation.
  - `components/ActionRow.tsx` — three `IconButton` instances.
  - `components/PhasePill.tsx`.
  - `components/OnboardingOverlay.tsx` — gated by localStorage flag.
  - `components/RefillingState.tsx`.
  - `hooks/useExploreQueue.ts` — local in-memory queue mirror; triggers refill when below threshold; reconciles after each swipe.
  - `hooks/useTopCardPreview.ts` — wires the top card's snapshot into the existing `PlayerProvider`.
- Modify `apps/web/src/features/player/MiniPlayerHost.tsx` — hide the docked mini-player when on `/explore` AND `currentTrack.snapshot.snapshotHash === topCard.snapshotHash`.
- Layer 3 Playwright spec at `apps/web/tests/e2e/explore.spec.ts` — four states + a11y assertions; uses `mockJsonRoute` from `./fixtures.ts` for `/api/explore/{next,swipe,profile}`.

**Suggested commit order:**

1. `spec: add UI-XX (×4), LOGIC-XX, BROWSER-XX (×3) invariants for explore page`
2. `test(invariants): stub the new invariants it.todo`
3. `feat(web-core): add directionFromDrag + swipe / next / profile fetchers + tests`
4. `feat(web): add ExplorePage with framer-motion swipe stack`
5. `feat(web): wire onboarding overlay + phase pill + refilling state`
6. `feat(web): hide mini-player on /explore when current track is top card`
7. `test(e2e): add Layer 3 spec for all four states + a11y`
8. tests turning `it.todo` into real assertions

Once feature 6 lands and `npm run verify` is green, `/new-feature` step 11 flips `EPIC.md` to `status: done` and removes the `design/` folder per the playbook.
