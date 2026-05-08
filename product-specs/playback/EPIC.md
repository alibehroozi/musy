---
status: planning
created: 2026-05-08
---

# Epic: Playback

## Vision

When a user taps a track from search results, the app finds a streamable audio source on a free / TOS-grey music network — Audius for the open catalog, SoundCloud as fallback — and plays it back. A persistent mini-player docks above the bottom navigation showing the current track. Tapping the mini-player expands to a full-screen "now playing" view inspired by Apple Music with cover art, transport controls, and a drag-to-scrub progress bar. Audio keeps playing while the user browses other tabs of the app or backgrounds the entire app, and lock-screen controls (via the Media Session API) let them pause, play, and skip without returning to the app.

## Why

- **User value:** "I can actually listen to the music I find." Users can browse the rest of moc — or any other app on their phone — while music plays continuously, with familiar lock-screen controls. Without playback, every search result is a dead end.
- **Business value:** every play is the cleanest "I like this enough to listen" signal we can capture. `track_started` records "explored" (interest score 3, matching the Search epic's row-tap convention); `track_completed` bumps the score to `max(score, 5)`. A new `listening_events` collection captures the raw stream — start times, stop times, elapsed ms — as the seed dataset for the future taste-modeling AI epic. The Search epic captures _what users searched for_; this epic captures _what they actually listened to_.

## Features (in order)

1. [01-stream-resolver-backend](./features/01-stream-resolver-backend.md) — `POST /play/resolve` accepts a track snapshot, looks up a streamable URL via Audius SDK (full tracks) or SoundCloud HTML scrape (`client_id` + `transcodings[].url`), caches the track→source mapping (not the URL itself, since SoundCloud transcodings expire).
2. [02-listening-events-backend](./features/02-listening-events-backend.md) — `POST /play/started` and `POST /play/completed` record listening events; the latter bumps `interest_scores.score = max(score, 5)`. New `listening_events` collection captures elapsed-ms for future taste signal.
3. [03-player-engine-and-mini-player](./features/03-player-engine-and-mini-player.md) — Audio engine in `libs/web/core/player`, `PlayerContext` in `apps/web`, `MiniPlayer` (DS, presentational) docked above the bottom nav. Search-row tap fires the existing "explored" event **and** starts playback. Failed-state mini-bar shows when resolver returns nothing.
4. [04-now-playing-screen-and-media-session](./features/04-now-playing-screen-and-media-session.md) — `NowPlayingScreen` reachable via expand from the mini-player; `ProgressSlider` (DS) for drag-to-scrub; chevron-down to collapse. Media Session API wires lock-screen + notification controls (title, artist, cover, play/pause, skip).

## Design system requirements

**Existing components used:** `Typography` (h1, h2, body, caption), `Button`, `Icon`, `BottomNav`, `ResultRow`.

**Missing components / additions to land first** (each via `/design-system` before the feature that needs it):

- **Additional `Icon` names** — extend the `lucide-react`-backed `Icon` wrapper with: `play`, `pause`, `skip-back`, `skip-forward`, `chevron-down`, `more-horizontal`, `alert-triangle`, `radio`. Needed for features 3 and 4.
- **`MiniPlayer`** — presentational component for the docked mini-player. Props: track snapshot, `isPlaying`, `progressFraction`, `state: "playing" | "loading" | "failed"`, `onPlayPause`, `onExpand`, `onDismiss`, optional `failedTitle?`. **Needed for feature 3.**
- **`ProgressSlider`** — drag-to-seek slider with thumb and time labels. Reusable for any future scrubbable UI. Props: `valueFraction`, `onScrub` (live), `onScrubEnd` (commit). **Needed for feature 4.**
- **`IconButton`** — assumed to exist by the Search epic's feat-05. If feat-05 has not landed by the time this epic starts feature 3, add `IconButton` via `/design-system` as a prerequisite for feature 3.

## Tooling decisions

- **Streamable-source providers (free, no monthly cap):**
  - **Audius** (primary) — already integrated by the Search epic's feat-02. The `@audius/sdk` exposes a stream-redirect endpoint (`/v1/tracks/{id}/stream`) that returns a Location header pointing at the audio. CC-licensed catalog, ~6M tracks, no key required. Open and legal for non-commercial use.
  - **SoundCloud** (fallback for tracks Audius doesn't have) — no public API for new apps; the streamable URL is extractable by fetching the track HTML page and parsing the JSON blob in `<script>`, which yields `transcodings[].url` and a per-page `client_id`. **TOS-grey** but acceptable per epic constraints (technically the same data the SoundCloud web player uses). Considered: Jamendo (only ~600k CC tracks; mainstream coverage poor), Internet Archive audio (catalog tilt wrong), Bandcamp (no API + scraping is harder), YouTube via yt-dlp (TOS-violation territory + signed URLs expire in ~6h, would need re-resolution per play; held as future option if Audius+SoundCloud coverage is insufficient).
- **Live radio:**
  - **Radio Browser** stations already return `streamUrl` directly via the Search epic's feat-02 — no additional resolver work needed for stations.
- **Audio playback (browser):**
  - **Native `HTMLAudioElement`** — built into every modern browser, supports cross-origin streaming, integrates with the Media Session API automatically. Considered: Howler.js (extra ~7KB for features we don't need; we want raw control over the audio element for Media Session), Tone.js (overkill — that's an audio-graph library for music apps that synthesize sound).
- **Media Session API:**
  - `navigator.mediaSession` is a **browser-native API** — no dependency, no polyfill. Works in mobile Chrome and Safari today. PWA install improves cosmetics on iOS but is not required for functionality.
- **HTTP from API to provider hosts:**
  - Native `fetch` (Node 22+ built-in) — already the convention from Search feat-02. No new HTTP client.
- **HTML parsing for SoundCloud scrape:**
  - **`linkedom`** (MIT) — a pure-JS DOM implementation, ~50 KB, vastly faster than `jsdom`, no native deps. Considered: `jsdom` (heavy, brings in CSS/canvas it doesn't need), regex-only (brittle — SoundCloud changes its embed JSON shape periodically; a real DOM/JSON parse survives that better). Confirm during feature 1 before adding the dep.

## Costs

All tools open-source or within free tiers as of 2026-05-08:

- **Audius** — free, no monthly cap, per-IP rate limit. Stream redirects don't count against any quota we control.
- **SoundCloud** — free, no key, but TOS-grey usage. The HTML page fetch + scrape happens once per unique track and is cached server-side as a track→source mapping (the URL itself is re-resolved per play because transcoding URLs expire).
- **`@audius/sdk`** — free (Apache-2.0), already in the dependency tree from Search feat-02.
- **`linkedom`** — free (MIT), npm-installable.
- **MongoDB Atlas M0** — `listening_events` writes are small (~200 bytes per event); even 100 events/user/day across 1k users would consume ~2 MB/month, easily within the 512 MB free tier.
- **Cloudflare R2 / Cloud Run audio bandwidth** — **not used.** Audio streams direct from provider hosts (Audius / SoundCloud / Radio Browser) to the user's browser. The API serves only the small JSON resolver and event payloads; audio bytes never touch our infrastructure.

**No paid commitment without separate approval.** If Audius+SoundCloud coverage is insufficient and YouTube becomes necessary, that's a **separate decision** because YouTube introduces (a) a same-origin proxy requirement (browser can't play YouTube audio URLs directly), which means audio bytes would start hitting Cloud Run — likely breaking the free tier — and (b) a deeper TOS-violation posture. Both warrant explicit user sign-off.

## Constraints / out of scope

- **Out of scope this epic:**
  - Queue / autoplay-next (skip-next is a no-op in v1)
  - Lyrics
  - Offline / download for later
  - Casting (AirPlay / Chromecast)
  - Spotify / Apple-account-linked full-track playback
  - Liked-tracks library _browse_ view (the save _action_ exists from Search feat-05; no list view ships in this epic)
  - Sleep timer, shuffle, repeat
  - Volume control inside the app (system volume governs)
  - Desktop-optimized layout (mobile-first only)
  - Color-extracted dynamic backgrounds on the now-playing screen (deferred enhancement)
  - YouTube as a stream source (deferred — see Costs section)
- **Constraints:**
  - Mobile-first PWA — every UI feature must work on a 375×667 viewport.
  - All providers must remain free / no-paid-tier.
  - $0 cost ceiling — no new paid services.
  - Audio plays **direct from provider hosts to the browser**; we never proxy bytes through our API. (Documented privacy boundary: provider hosts see the user's IP, same as any web audio player.)

## Implementation hint for future agents

Each feature file under `./features/` is self-contained. Run `/new-feature product-specs/playback/features/NN-<slug>.md` to start that feature. Implement strictly in order — feature 3 depends on feature 1's resolver endpoint and feature 2's event endpoints; feature 4 depends on feature 3's player context.

Before features 3 and 4, run `/design-system` for each missing component listed under that feature's "DS components required but missing" section.
