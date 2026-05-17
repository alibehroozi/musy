---
epic: taste
status: pending
estimated-invariants: 6
---

# Feature 08: Bucket detail UI

## Product description

The second user-visible surface of the epic. Tapping a bucket card on `/taste` (feature 07) routes to `/taste/buckets/:bucketId` where the user sees:

- A back arrow in a thin header (no other chrome — Spotify-playlist-style).
- A large square cover (~200×200) — same artwork rule as feature 07's bucket cards (top-scored song's `artworkUrl`, gradient fallback).
- Bucket `name` in large type.
- Subtitle: `"N songs"` (e.g. "12 songs").
- A primary full-width **▶ Play all** button.
- Below: the bucket's song list using the existing `ResultRow` component from search. **The `⋮` / trailing-action slot is intentionally dropped** for bucket rows — per the epic plan, buckets don't surface save / remove / reorder in v1.
- Tapping a song row plays it via the existing `PlayerProvider` (`playSnapshot(snapshot, { bucketId, bucketKind })` — passing the bucket context lets feature 06's skip tracking know where the play came from).
- Tapping **Play all** enqueues the entire bucket's song list (sorted by `bucket_song_scores.score` desc) into the player, then starts playback at index 0.

The MiniPlayer renders above the BottomNav whenever a track is playing (existing behavior — this feature inherits it).

A new endpoint `GET /api/me/taste/buckets/:bucketId` returns the bucket plus its full song list:

```
{ bucket: TasteBucket, songs: Array<{ songKey, snapshot, score }> }
```

— sorted by `score` desc. (We can't reuse `GET /api/me/taste/profile` because that returns a list-view payload; carrying full song lists for every bucket would balloon the home-screen response.)

## User behavior

Manual exercise:

1. Sign in. Make sure the user has ≥ 1 bucket with songs (run features 04 / 05 manually).
2. Navigate to `/taste` → tap a bucket card → URL changes to `/taste/buckets/:bucketId`.
3. Page matches [bucket-detail.html](../design/bucket-detail.html): back arrow, large cover, bucket name, "N songs", Play all, song list.
4. Tap a row → song starts; MiniPlayer appears.
5. Tap Play all → first song starts; subsequent rows queue up. After the first song ends, the second starts automatically.
6. Tap the back arrow → returns to `/taste`.
7. Tap a building or failed bucket from `/taste` → either route is allowed but the detail page renders a "Building…" or "Failed" placeholder respectively, with no song list and no Play all button. (Out of scope: live re-poll on this page; the user can just go back.)

**Failure modes:**

- Bucket id not found / belongs to another user → 404 + `ErrorResponse` → page renders a "Bucket not found" message + back link.
- Server error fetching bucket detail → "Couldn't load this bucket" + retry button.
- Player engine error on play (per existing playback epic) → existing error toast surface; no new surface added.
- User has no `bucket_song_scores` for the bucket (edge case — e.g. an empty `failed` bucket) → song list empty; Play all hidden.

**Empty / first-run state:** there's no "empty state" for this page per se — every bucket has at least the cover + name. A bucket with 0 songs hides Play all; the list area shows a subtle "(no songs yet)" muted line.

## Design

**Visual mockup:**

- [bucket-detail.html](../design/bucket-detail.html) — back + cover + Play all + song list + active MiniPlayer

**DS components used:** `Typography` (h1, caption), `Button` (primary lg), `IconButton` (back arrow), `ResultRow` (song list — trailing slot **not** rendered for bucket rows), `MiniPlayer`, `BottomNav`. All existing.

**DS components required but missing:** none.

**Layout notes:** mobile-first 375×667. Hero is centered: cover (200×200), name (large), subtitle, full-width Play all button (max 280 px). Song list is full-width, no horizontal padding inside rows (the row component handles its own padding). When a song from this bucket is playing, the MiniPlayer renders between the song list and the BottomNav.

## Backend

**New endpoints:**

- `GET /api/me/taste/buckets/:bucketId` (auth-required) — returns 200 with `{ bucket: TasteBucket, songs: Array<{ songKey: string, snapshot: SongSnapshot, score: number }> }`, sorted by `score` desc. 404 if the bucket doesn't exist or doesn't belong to the authenticated user.

**Changed endpoints:** none.

**New / changed Mongoose collections:** none. Read-only from existing `buckets` + `bucket_song_scores`.

**New env vars:** none.

## Tooling

**New deps:** none. Routing uses the existing React Router setup (whatever version is already in `apps/web/`).

**External services:** none.

## Privacy

- User → API: a `bucketId` path param (uuid).
- API → third party: nothing.
- API → LLM: nothing.
- Stays server-only: the bucket detail rows, scores.

## Acceptance criteria

- [ ] Tap a bucket card on `/taste` → URL changes to `/taste/buckets/:bucketId` and the page matches [bucket-detail.html](../design/bucket-detail.html) (visual snapshot + a11y).
- [ ] Header shows back arrow only; tap returns to `/taste`.
- [ ] Cover, name, and "N songs" subtitle render. `N` matches the song list length.
- [ ] Song list is sorted by `score` desc; songs without a `score` row never appear (impossible per the schema, but defensively tested).
- [ ] Tap a row → `PlayerProvider.playSnapshot(snapshot, { bucketId, bucketKind })` fires with the correct args (feature 06 reads these).
- [ ] Tap **Play all** → enqueues the entire list in score-desc order; first song starts; second auto-plays at end of first (uses existing player queueing).
- [ ] `/taste/buckets/:bucketId` with another user's `bucketId` returns 404 (server) and renders "Bucket not found".
- [ ] A bucket in `state: "building"` renders a Building placeholder, no song list, no Play all.
- [ ] A bucket in `state: "failed"` renders the `errorReason` text + back link.
- [ ] No raw HTML `<button>` / `<input>` in the new files (lint rule from AGENTS.md hard rule #14 catches this).
- [ ] The `ResultRow` instances do not render a trailing-action slot in this page (verified by snapshot diff against the search-page row count).

## Suggested invariants

The agent in `/new-invariant` will refine these — seeds, not commitments:

- **API-XX:** `GET /api/me/taste/buckets/:bucketId` returns 401 without a session; 404 for an unknown / non-owned bucket; 200 + `{ bucket, songs }` otherwise.
- **SEC-XX:** `GET /api/me/taste/buckets/:bucketId` for user A never returns user B's bucket (scopes both the `buckets` lookup and the `bucket_song_scores` query by authenticated `userId`).
- **UI-XX:** The bucket-detail page renders Play all if and only if the bucket is `state: "ready"` and has ≥ 1 song.
- **UI-XX:** Tapping a row calls `PlayerProvider.playSnapshot` with the row's `snapshot` and the page's `{ bucketId, bucketKind }`.
- **BROWSER-XX:** Visual snapshot test for the populated detail page passes at 375×667; a11y check (WCAG AA contrast, focus visible, back-button is keyboard-reachable) passes.
- **LOGIC-XX:** The song list order equals the sort of `bucket_song_scores` by `score` desc, with a deterministic tie-break by `lastUpdatedAt` desc (asserted via unit test on the sorting helper).

## Implementation hint for /new-feature

**Where things live:**

- **Contracts** in `libs/shared/contracts/src/taste.ts` (extend):
  - `BucketDetailResponse = z.object({ bucket: TasteBucket, songs: z.array(z.object({ songKey: z.string(), snapshot: SongSnapshot, score: z.number().int().min(0).max(100) })) })`
- **Pure logic** in `libs/web/core/taste/`:
  - `sort-songs.ts` — `sortBySCoreDesc(rows): rows`. Pure / deterministic with tie-break by `lastUpdatedAt` desc. Unit-tested.
- **NestJS** in `apps/api/src/modules/taste/`:
  - `taste.controller.ts` — add `GET /me/taste/buckets/:bucketId`.
  - `taste.service.ts` — add `getBucketDetail(userId, bucketId)`.
- **React feature** in `apps/web/src/features/taste/`:
  - `BucketDetailPage.tsx` — top-level page.
  - `BucketHero.tsx` — cover + name + N-songs + Play all.
  - `BucketSongList.tsx` — list of `ResultRow`s with no trailing slot.
  - `useBucketDetail.ts` — fetcher.
  - Reuse `tasteApi.ts` from feature 07.
- **Routing:** wire `/taste/buckets/:bucketId` in the app router. If feature 07 stubbed the route, fill it in here.
- **Player integration:** read `PlayerProvider.playSnapshot` signature in `apps/web/src/features/player/PlayerProvider.tsx`. If it doesn't yet accept a `{ bucketId, bucketKind }` second arg, **extend the signature in this feature** with a separate `feat(web)` micro-commit (a one-line type / call-site change) — feature 06's backend wiring already expects the client to pass these fields, so this is the moment the client side actually starts doing so.
- **Play all integration:** if `PlayerProvider` doesn't yet have a queue concept, either (a) implement a minimal "enqueue + auto-advance" inside the bucket-detail page using existing primitives, or (b) extract a `Queue` concept into the player feature. Pick the smaller patch; if both are large, document and propose splitting in the PR.

**Playwright + a11y:** add Layer 3 spec at `apps/web/playwright/taste/bucket-detail.spec.ts`. Calls `toHaveScreenshot` against [bucket-detail.html](../design/bucket-detail.html) and `expectAccessible(page)`. Mock `GET /api/me/taste/buckets/:bucketId` in the fixture.

**Suggested commit order:**

1. `spec: add API-XX, SEC-XX, UI-XX (×2), BROWSER-XX, LOGIC-XX invariants for bucket detail`
2. `test(invariants): stub the new invariants it.todo + unit tests for sortBySCoreDesc (red)`
3. `feat(contracts): add BucketDetailResponse schema`
4. `feat(api): add GET /me/taste/buckets/:bucketId + getBucketDetail service method`
5. `feat(web-core): add sortBySCoreDesc helper`
6. `feat(web): add BucketDetailPage + BucketHero + BucketSongList + useBucketDetail + route wiring + player extension`
7. `test(visual, web): Playwright spec + baseline for bucket-detail`
8. tests turning `it.todo` into real assertions

**On the last commit, flip [EPIC.md](../EPIC.md)'s frontmatter `status: planning` → `status: done` AND delete the entire `product-specs/taste/design/` folder.** The design folder is a planning-time artifact only; carrying it past completion lets it rot. Per AGENTS.md hard rule #11 / `/new-feature` step 11.
