---
epic: playback
status: pending
estimated-invariants: 6
---

# Feature 04: Now-playing screen + Media Session

## Product description

Build the Apple-Music-style full-screen now-playing view, reachable from the mini-player's expand affordance. The screen shows large square cover art, the title and artist (or station name and meta line), a drag-to-scrub progress bar with current and remaining time, large transport controls (skip-back, large play/pause, skip-forward), a save-heart, a source badge in the corner, and a chevron-down to collapse back to the mini-player. Tracks and live-radio stations both render through this same screen with two layout variants: the track variant has a progress bar; the station variant replaces it with a `LIVE` indicator (a pulsing dot + "LIVE" text in `text-danger`), and disables both skip buttons.

This feature also wires the Media Session API: `navigator.mediaSession.metadata` is set to the current track's title, artist, and cover; `navigator.mediaSession.setActionHandler` is registered for `play`, `pause`, `previoustrack` (skip-prev → seek to 0), and `nexttrack` (no-op for v1, handler greys it). On supporting platforms (mobile Chrome and Safari, in-app and lock-screen), the system shows the now-playing card with cover art and these controls.

The now-playing screen is implemented as an **in-shell overlay**, not a route — a route would interfere with the bottom navigation and audio routing, and the back button should collapse the overlay rather than navigate. The overlay is full-viewport, slides up from the bottom on expand, slides back down on collapse.

## User behavior

1. **Tap the mini-player body or expand-chevron** — now-playing overlay slides up from the bottom in ~200 ms (the `--transition-normal` token). The mini-player is hidden under the overlay.
2. **Track variant — playing:** cover art is centered, title and artist below, progress bar shows the current playback position, transport buttons let the user pause/resume and skip-back. Skip-forward is greyed (no queue v1). Tapping the cover art does nothing in v1.
3. **Track variant — paused:** identical except the play/pause button shows the play icon. Tapping it resumes from the current position.
4. **Station variant:** cover area shows the station's favicon (or a letter avatar with the station's first letter); title shows the station name, sub-line shows `"<country> · <listenerCount> listening"`; instead of a progress bar, the `LIVE` indicator is shown; skip-back and skip-forward are both visually disabled.
5. **Drag-to-scrub (track variant only):** the user drags the progress thumb; while dragging, the displayed time updates but the audio doesn't seek; on release, the audio seeks to the new position. (Live scrubbing of audio while dragging is jarring on mobile; commit-on-release is the iOS pattern.)
6. **Lock screen / notification:** while the now-playing screen is open or while the user is anywhere in the app with playback active, the OS-level Media Session card appears (on supporting browsers). Cover, title, artist; play/pause/skip buttons work without unlocking.
7. **Collapse via chevron-down:** the overlay slides down; the mini-player is again visible at the bottom of the underlying page.
8. **Native back button (Android / browser back):** behaves like the chevron — collapses the overlay; does not navigate the underlying route.
9. **No track playing:** the now-playing overlay is not reachable (mini-player is not rendered, so there's no expand affordance).

**Failure modes the user can reach:**

- During scrubbing, the audio buffer doesn't yet cover the target — the audio seeks anyway and pauses while it loads; the play/pause icon reflects the loading state.
- Media Session is unavailable on the platform (older browsers) — the overlay still works fully; only the lock-screen card is missing. Detected at runtime via `if ("mediaSession" in navigator)`.
- A station's `streamUrl` redirects to a different host than Radio Browser advertised — the audio element follows the redirect transparently; no user-facing case.

**Empty / first-run state:** Not applicable — the now-playing screen is only reachable after the first play.

## Design

**Visual mockup:** [../design/now-playing-track.html](../design/now-playing-track.html) (track variant, playing). [../design/now-playing-station.html](../design/now-playing-station.html) (station variant, live). The paused-track variant differs from the playing-track variant only by the center transport icon (▶ vs ⏸) and the (paused) progress thumb position — covered by inline annotation in this spec rather than a third HTML mock. Playwright `toHaveScreenshot` baselines added in this feature should match the approved mockups.

**DS components used:** `Typography` (h2 for title, body for artist/sub), `Icon` (chevron-down, more-horizontal, skip-back, skip-forward, play, pause, heart, radio), `IconButton` (assumed exists from Search feat-05; reused for the collapse, more, and save buttons), `MiniPlayer` (from feature 3 — re-rendered when overlay is collapsed).

**DS components required but missing:**

- **`ProgressSlider`** — drag-to-seek slider component. Props: `{ valueFraction: number, onScrub: (fraction: number) => void, onScrubEnd: (fraction: number) => void, ariaLabel: string }`. Shows a horizontal track, a primary-colored fill, and a draggable thumb. Listens for `pointerdown / pointermove / pointerup` (works for mouse + touch). Purely presentational — the parent maps the fraction to the audio's `currentTime`. Visual matches the progress section of `now-playing-track.html`.
- **Additional `Icon` names** — extend with: `skip-back`, `skip-forward`, `chevron-down`, `more-horizontal`, `radio`. (`play`, `pause`, `alert-triangle` already added by feature 3.)

**Layout notes:**

- The overlay is rendered as a sibling of `<AppRoutes/>` and `<MiniPlayerHost/>` inside `<PlayerProvider>`, controlled by an `isExpanded` boolean in the player context. CSS positions it `fixed inset-0`, `z-modal` from the design tokens, with a `transform: translateY(100%)` → `translateY(0)` transition.
- Cover-art square is `min(280px, 75vw)` so it scales down sanely on very narrow screens; the mockup is 280×280 at 375 px wide.
- The `LIVE` indicator pulses via a CSS keyframe animation that respects `prefers-reduced-motion: reduce` (animation disabled, dot stays solid).
- The save-heart in the top-right of the title row reuses the same `IconButton` and outline/filled variant logic as Search feat-05's row save-button — toggling it fires the existing `/search/saved` endpoint.

## Backend

**New endpoints:** none — this feature is fully UI on top of features 1, 2, and 3.

**New / changed Mongoose collections:** none.

**New env vars:** none.

## Tooling

**New deps:** none — Media Session is browser-native; `pointerdown / move / up` are DOM events; the `<audio>` element from feature 3 is reused.

**External services:** none.

## Privacy

What data crosses which boundary:

- User → API: only the existing endpoints from features 2 and Search feat-05 (started, completed, saved). No new boundary.
- **Browser → OS / Media Session:** the OS receives the track title, artist, and cover URL via `mediaSession.metadata`. The cover URL is from the public provider; titles and artists are public catalog data. No user identifier crosses this boundary. Documented OS-level boundary: the lock-screen image is fetched by the OS (which sees the user's IP).
- API → LLM prompt: none.
- Stays browser-only: scrub state during drag (committed only on release).

## Acceptance criteria

- [ ] Tapping the mini-player body or its expand-chevron slides the now-playing overlay up; the cover, title, artist, progress, and transport controls render correctly for a track.
- [ ] Tapping the chevron-down collapses the overlay; the underlying page (and mini-player) is visible again.
- [ ] Hardware/browser back button collapses the overlay; if the overlay is already collapsed, it navigates the underlying route as normal.
- [ ] For a station, the LIVE indicator is visible, both skip buttons are visually disabled, and there is no progress bar.
- [ ] Drag the progress thumb left/right — current-time label updates live; the audio seeks to the new position only on pointer release.
- [ ] On a Chrome / Safari mobile browser, the OS-level Media Session card shows the title, artist, and cover; tapping its play/pause toggles audio in the app.
- [ ] Skip-prev on a track playing past 0:00 rewinds to 0:00 (does not switch tracks).
- [ ] Skip-next is visually disabled (no queue v1) — tapping it does nothing.
- [ ] When `mediaSession` is not available on the platform, the overlay still works; an integration test asserts no error is thrown during PlayerProvider mount.
- [ ] Page renders without horizontal scroll on a 375×667 viewport in both track and station variants.
- [ ] WCAG AA contrast passes on every visible state per `expectAccessible(page)`.
- [ ] `prefers-reduced-motion: reduce` disables the slide-up/slide-down transition and the LIVE-dot pulse.

## Suggested invariants

The agent in `/new-invariant` will refine these — they're seeds, not commitments:

- **UI-XX:** When the user expands the mini-player, the now-playing overlay is rendered with role `dialog` (or equivalent), is the active focus container, and traps Tab focus until collapsed.
- **UI-XX:** For a station, the now-playing screen renders a `LIVE` indicator and disabled skip buttons, and does **not** render a progress bar; for a track, it renders the progress bar and an enabled skip-back button.
- **LOGIC-XX:** The pure `formatProgress(currentMs, durationMs): { fraction, currentLabel, remainingLabel }` function in `libs/web/core/player/` is deterministic and handles edge cases (durationMs 0, currentMs > durationMs, NaN).
- **BROWSER-XX:** On a 375×667 mobile viewport, the now-playing screen fits without horizontal scroll, the cover art is at least 240×240 px, transport buttons are ≥ 44×44 px touch targets, and there is no overlap between the collapse chevron and the more-overflow button.
- **PWA-XX:** When playback is active and `navigator.mediaSession` is available, `mediaSession.metadata.title`, `.artist`, and `.artwork` reflect the current track; action handlers `play`, `pause`, `previoustrack` are registered.
- **LOGIC-XX:** The scrub interaction commits the audio seek **only on pointer release**, not during drag — verifiable via a unit test that simulates pointer events on `ProgressSlider` and asserts `onScrubEnd` fires once at release time.

## Implementation hint for /new-feature

This file is self-contained. The "Product description" becomes the feature description, the "Suggested invariants" seed `/new-invariant`'s exploration, and the "Acceptance criteria" are the manual-exercise checklist before opening the PR.

**Where things live (per ARCHITECTURE.md layering):**

- Contracts: no changes.
- Pure logic in `libs/web/core/player/`:
  - `format-progress.ts` — `formatProgress(currentMs, durationMs)` returning `{ fraction, currentLabel, remainingLabel }`.
- Components in `libs/web/design-system/src/components/ProgressSlider/`:
  - `ProgressSlider.tsx`, `.test.tsx`, `.stories.tsx`. Stories cover idle, mid-drag, and at-end states.
- React feature in `apps/web/src/features/player/`:
  - `NowPlayingOverlay.tsx` — full-screen overlay; reads context for current track, isPlaying, progressFraction; renders track or station variant.
  - `useMediaSession.ts` — hook called from `PlayerProvider` (extend feature 3's provider to also call this hook). Sets `mediaSession.metadata` and `setActionHandler` whenever `currentTrack` changes.
- App-shell wiring in `apps/web/src/App.tsx`: render `<NowPlayingOverlay/>` as a sibling of `<AppRoutes/>` and `<MiniPlayerHost/>`; visibility controlled by `usePlayer().isExpanded`.

**Suggested commit order:**

1. `spec: add UI-XX, LOGIC-XX, BROWSER-XX, PWA-XX invariants for now-playing overlay + Media Session`
2. `test(invariants): stub the new invariants it.todo`
3. `feat(design-system, progress-slider): add ProgressSlider component + new icons`
4. `feat(web-core): add formatProgress pure helper`
5. `feat(web): add NowPlayingOverlay (track + station variants)`
6. `feat(web): add useMediaSession hook + wire into PlayerProvider`
7. `feat(web): wire mini-player expand to overlay isExpanded; collapse on back button`
8. tests turning `it.todo` into real assertions
