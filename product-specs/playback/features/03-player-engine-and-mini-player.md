---
epic: playback
status: pending
estimated-invariants: 7
---

# Feature 03: Player engine + mini-player UI

## Product description

Wire up actual playback. Tapping a search result row now does two things in a single tap: (a) records the existing "explored" event from Search feat-05 (interest score 3); (b) starts playback of that track. A `MiniPlayer` (a new design-system component) docks above the bottom navigation showing the currently-playing track's cover, title, artist, a play/pause button, an expand affordance, and a thin progress bar. The mini-player is visible on every routed page (`/explore`, `/taste`, `/search`) so the user can change tabs and the player keeps playing. When playback fails (resolver returned `source: null`, or the audio element errored), the mini-player switches to the failed-state variant: a warning icon, "Couldn't play '<title>'" with a dismiss-X. The full-screen now-playing view does **not** ship in this feature — that's feature 4. The mini-player's expand button is wired but inert (a no-op) until feature 4 lands.

Audio playback uses a single global `HTMLAudioElement` driven by a `PlayerContext`. The audio engine itself — the state machine that turns "user wants to play track X" into "set src, call .play(), listen for playing/ended/error" — lives in `libs/web/core/player/` so it's testable without React or a real `<audio>` element.

Anonymous users can listen (no sign-in gate at the player level). The `track_started` and `track_completed` event POSTs from feature 2 fire only for authenticated users — anonymous events are dropped on the FE side.

## User behavior

1. **Authenticated user, track plays cleanly:** user submits a search → results render → user taps a row → the row briefly highlights (the existing feat-05 explored-flash) → mini-player appears at the bottom with title, artist, the cover (or letter avatar), and a spinner where the play/pause icon goes → spinner resolves to a pause icon when audio actually begins → progress bar starts filling. User can navigate to `/explore` or `/taste` and the mini-player follows them. Tapping the play/pause toggles audio. Tapping anywhere else on the mini-player body triggers a no-op (feature 4 will wire it to expand).
2. **Authenticated user, track plays to completion:** the track ends → mini-player switches its play/pause icon to play (paused at end) → `POST /play/completed` fires once with the actual elapsed-ms.
3. **Authenticated user, track plays partially then user taps a different row:** the previous track is replaced; no `completed` event fires for the abandoned track (only the new one's `started`). The previous track's listening was already captured by its `started` event from feature 2.
4. **Authenticated user, resolver returns `source: null`:** mini-player switches to the failed-state variant immediately; no audio is attempted; no `started` event fires (nothing started).
5. **Authenticated user, resolver returns a stream URL but the audio element 403s:** mini-player switches to the failed-state variant after the audio `error` event. No `completed` event fires.
6. **Anonymous user, taps a row:** Search feat-05 gates the row tap with the sign-in modal — that behavior is unchanged. **Before** feat-05 ships, anonymous tap goes straight to playback (no events fire, no UI gate). The two features compose cleanly.
7. **User signs in mid-listen (after an anonymous play started):** the previously-playing audio keeps playing; the next tap records "explored" and bumps `interest_scores`.
8. **Mini-player visible across routes:** navigating between `/search`, `/explore`, `/taste` does not interrupt audio.
9. **Tab backgrounded:** the page Visibility API does not pause the audio. The user returns to find audio still playing.
10. **App backgrounded (mobile):** the browser keeps the audio playing for as long as the OS permits (typically until the user explicitly kills the tab).

**Failure modes the user can reach:**

- Resolver 5xx — mini-player shows the failed-state variant with copy "Couldn't reach the player service" instead of the per-track copy.
- Browser `<audio>` `error` event — failed-state variant.
- Two rows tapped in quick succession — the second tap cancels the first's pending resolution; no orphaned audio.

**Empty / first-run state:** before any track has been played, no mini-player is rendered (the bottom nav sits flush against the safe-area-inset). Mini-player appears the first time the user taps a playable row.

## Design

**Visual mockup:** [../design/search-with-mini-player.html](../design/search-with-mini-player.html) — primary state showing the docked mini-player above the bottom nav. [../design/mini-player-failed.html](../design/mini-player-failed.html) — failed state. The Playwright `toHaveScreenshot` baselines added in this feature should match the approved mockups.

**DS components used:** `Typography` (caption for mini-player title and subtitle), `Icon` (play, pause, alert-triangle, x, chevron-up — see additions list below), `IconButton` (for play/pause and dismiss; assumed to exist from Search feat-05), `BottomNav` (unchanged — mini-player slots above it), `ResultRow` (unchanged shape — gains a `playingOverlay?: boolean` prop, see Layout notes).

**DS components required but missing:**

- **`MiniPlayer`** — presentational component, no internal state. Props: `{ track: SongSnapshot, isPlaying: boolean, progressFraction: number, state: "playing" | "loading" | "failed", onPlayPause: () => void, onExpand: () => void, onDismiss: () => void, failedTitle?: string }`. Renders all three states; the parent picks via `state`. Visual matches `search-with-mini-player.html` and `mini-player-failed.html` exactly.
- **Additional `Icon` names** — extend the `Icon` wrapper with: `play`, `pause`, `alert-triangle`, `chevron-up` (the close `x` already exists). No new dep — `lucide-react` already provides all of these.
- **`IconButton`** — assumed added by Search feat-05. If feat-05 has not landed when this feature starts, add `IconButton` via `/design-system` first.

**Layout notes:**

- The app shell at `apps/web/src/App.tsx` is currently `flex flex-col` with `<AppRoutes/>` then `<BottomNav>`. Insert `<MiniPlayerHost/>` (a small connector reading `PlayerContext`) between them. The mini-player + bottom-nav together form a sticky bottom region; the mini-player itself respects no safe-area inset (the bottom-nav owns the safe-area padding below it).
- The mini-player slides in from the bottom on first appearance (`transition: transform var(--transition-fast)`), respecting `prefers-reduced-motion: reduce` (no transition).
- The currently-playing search row gets a small play overlay on its artwork (visible at `search-with-mini-player.html`'s first row). `ResultRow` gains an optional prop `playingOverlay?: boolean` — defaults to `false`. The Search page reads from `PlayerContext` and passes `playingOverlay={track.id === currentlyPlaying?.id}`.

## Backend

**New endpoints:** none — this feature consumes feature 1's `/play/resolve` and feature 2's `/play/started` and `/play/completed`.

**New / changed Mongoose collections:** none.

**New env vars:** none.

## Tooling

**New deps:** none — `HTMLAudioElement` is browser-native, the resolver and event APIs are already in place from features 1 and 2.

**External services:** none — audio bytes stream directly from Audius / SoundCloud / Radio Browser to the browser.

## Privacy

What data crosses which boundary:

- User → API: song snapshots when calling `/play/resolve` (no user identifier needed; route is public). Session cookie (automatic) when firing `/play/started` and `/play/completed` for authenticated users.
- API → third party: none from this feature directly. The browser fetches audio bytes from provider hosts directly.
- **Browser → provider hosts (Audius / SoundCloud / Radio Browser):** the audio fetch carries the user's IP address (visible to the provider). No user identifier from our side. Documented epic-level boundary: provider hosts see the user's IP, same as any web audio player.
- API → LLM prompt: none.
- Stays browser-only: the in-memory `PlayerContext` state — current track, position, isPlaying.

## Acceptance criteria

- [ ] Tapping a search result row that resolves cleanly to Audius starts audio playback within 2 seconds; the mini-player appears with the correct track metadata.
- [ ] Tapping a row that falls back to SoundCloud also plays cleanly (the FE doesn't care which source the resolver picked).
- [ ] Tapping a row that resolves to `source: null` shows the failed-state mini-player; no audio is attempted.
- [ ] Mini-player remains visible while navigating between `/search`, `/explore`, and `/taste`; audio does not pause.
- [ ] Tapping the play/pause button toggles audio; the icon updates to match the new state.
- [ ] When audio reaches its natural end, the play/pause icon flips to play, and a `POST /play/completed` fires exactly once.
- [ ] Tapping a different row while a track is playing replaces the audio source; only the new track's `started` event fires.
- [ ] For authenticated users, tapping a row fires both the existing Search feat-05 "explored" event and the new `POST /play/started`.
- [ ] For anonymous users (when feat-05 hasn't yet gated taps), tapping a row plays audio but no `started` / `completed` events fire.
- [ ] Currently-playing row in the search results shows a small play overlay on its artwork.
- [ ] Mini-player play/pause button has a touch target ≥ 44×44 px (BROWSER-XX echo of feat-05's IconButton size requirement).
- [ ] Page renders without horizontal scroll on a 375×667 viewport in both states (playing + failed).
- [ ] WCAG AA contrast passes on every visible mini-player state per `expectAccessible(page)`.

## Suggested invariants

The agent in `/new-invariant` will refine these — they're seeds, not commitments:

- **UI-XX:** When a track is playing (or paused mid-track), the mini-player is visible above the bottom nav on every routed page (`/explore`, `/taste`, `/search`).
- **UI-XX:** When no track has ever been played, no mini-player is rendered.
- **UI-XX:** The currently-playing search result row is rendered with a play overlay on its artwork; non-playing rows are not.
- **LOGIC-XX:** The audio engine in `libs/web/core/player/` is a deterministic state machine: given an event sequence (`load`, `play`, `pause`, `error`, `ended`, etc.), the resulting `(currentTrack, isPlaying, errorState)` triple is stable and testable without a real `<audio>` element (mock the element).
- **LOGIC-XX:** The web-core `resolveAndPlay(snapshot)` flow validates the `/play/resolve` response with the `ResolveResponse` Zod schema and throws `ZodError` on shape drift.
- **BROWSER-XX:** On a 375×667 mobile viewport, the mini-player + bottom nav fit within the bottom region without occluding the last visible result; there is no horizontal scroll; touch targets on the play/pause and dismiss buttons are ≥ 44×44 px.
- **PRIVACY-XX:** The browser's audio-fetch URL passed to `<audio src=...>` originates from the resolver response; no user-identifier query param is added to it by FE code.

## Implementation hint for /new-feature

This file is self-contained. The "Product description" becomes the feature description, the "Suggested invariants" seed `/new-invariant`'s exploration, and the "Acceptance criteria" are the manual-exercise checklist before opening the PR.

**Where things live (per ARCHITECTURE.md layering):**

- Contracts in `libs/shared/contracts/src/play.ts`: already populated by features 1 + 2 — no changes.
- Pure logic in `libs/web/core/player/`:
  - `audio-engine.ts` — the state machine. Takes an injected `audio: { play, pause, setSrc, on(event, cb) }` interface so it can be tested with a mock. Emits `("started" | "completed" | "errored")` events for the React layer to fire `/play/started` and `/play/completed`.
  - `resolve-and-play.ts` — the orchestration: call `/play/resolve`, validate via the contract, hand to the engine.
- Components in `libs/web/design-system/src/components/MiniPlayer/`:
  - `MiniPlayer.tsx` — presentational, all three states, no fetcher.
  - `MiniPlayer.test.tsx` — render each state, assert visible elements + a11y.
  - `MiniPlayer.stories.tsx` — Ladle stories for `playing`, `loading`, `failed`.
- React feature in `apps/web/src/features/player/`:
  - `PlayerProvider.tsx` — context provider; owns the singleton `<audio>` element via `useRef`; instantiates the engine; exposes `currentTrack`, `isPlaying`, `progressFraction`, `playSnapshot`, `togglePlay`, `dismissFailed`.
  - `usePlayer.ts` — hook (re-export of context + selectors).
  - `api.ts` — `resolveStream(snapshot)`, `recordStarted(...)`, `recordCompleted(...)`. Each parses the response with the shared contract.
- App-shell wiring in `apps/web/src/App.tsx`: render `<PlayerProvider>` around `<AppRoutes/>` and the (new) `<MiniPlayerHost/>` (a small connector component that reads context and renders the DS `<MiniPlayer>`).
- Search-row wiring in `apps/web/src/features/search/`: extend the row tap handler to call `playerContext.playSnapshot(snapshotFromRow)` in addition to the existing feat-05 behavior. The two effects compose: feat-05 fires "explored", this feature fires `playSnapshot` which internally fires `/play/started`.

**Suggested commit order:**

1. `spec: add UI-XX, LOGIC-XX, BROWSER-XX, PRIVACY-XX invariants for player engine + mini-player`
2. `test(invariants): stub the new invariants it.todo`
3. `feat(design-system, mini-player): add MiniPlayer presentational component + new icons`
4. `feat(web-core): add audio-engine state machine + resolve-and-play orchestration`
5. `feat(web): add PlayerProvider + usePlayer hook + api.ts fetchers`
6. `feat(web): wire MiniPlayer into App.tsx, render currently-playing overlay on ResultRow`
7. `feat(web): wire search-row tap to playSnapshot (composes with feat-05 explored event)`
8. tests turning `it.todo` into real assertions
