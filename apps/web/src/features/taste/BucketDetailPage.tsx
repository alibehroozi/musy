import { useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { BucketDetailSong, TasteBucket } from "@moc/contracts";
import { Button, IconButton, Typography } from "@moc/design-system";
import { splitSongKey } from "@moc/web-core";
import { useBucketDetail } from "./useBucketDetail.js";
import { usePlayer } from "../player/usePlayer.js";
import { BucketHero } from "./components/BucketHero.js";
import { BucketSongList } from "./components/BucketSongList.js";

const PROVIDER_LABEL: Record<string, string> = {
  audius: "Audius",
  deezer: "Deezer",
  "radio-browser": "Radio",
  genius: "Genius",
  soundcloud: "SoundCloud",
};

function providerLabelOf(songKey: string): string {
  const split = splitSongKey(songKey);
  if (split === null) return "Track";
  return PROVIDER_LABEL[split.source] ?? split.source;
}

/**
 * Feature 08: `/taste/buckets/:bucketId`. Three rendered states by the
 * fetched bucket's `state`:
 *
 *   - "ready"    → hero + Play all (when songs ≥ 1) + song list
 *   - "building" → hero with "Building…" subtitle, no list, no Play all
 *   - "failed"   → hero with errorReason text, no list, no Play all
 *
 * Plus a 404 surface for "Bucket not found" and a 5xx/network surface
 * for "Couldn't load this bucket" with a retry button. The header is
 * a single back IconButton — no other chrome (UI-37 / BROWSER-08).
 */
export function BucketDetailPage(): JSX.Element {
  const { bucketId } = useParams<{ bucketId: string }>();
  const navigate = useNavigate();
  const { state, refresh } = useBucketDetail(bucketId);
  const { playSnapshot, engineState } = usePlayer();

  const goBack = useCallback(() => navigate("/taste"), [navigate]);

  // Queue + current-index refs so the Play-all auto-advance is
  // observable across renders without re-running the effect every time
  // engineState ticks. The currentRef tracks the most recently played
  // songKey so we can advance only when *its* track ends.
  const queueRef = useRef<readonly BucketDetailSong[] | null>(null);
  const indexRef = useRef(0);
  const currentRef = useRef<string | null>(null);

  const bucket: TasteBucket | null = state.status === "ready" ? state.data.bucket : null;
  const songs: readonly BucketDetailSong[] = state.status === "ready" ? state.data.songs : [];

  const bucketOrigin = useMemo(
    () => (bucket ? ({ bucketId: bucket.id, bucketKind: bucket.kind } as const) : null),
    [bucket],
  );

  // Resolve the (source, externalId) for a song row and call
  // playSnapshot with the bucket origin. Returns false when the
  // songKey is malformed (defensive — should not happen given the
  // server-side schema).
  const playRow = useCallback(
    (song: BucketDetailSong): boolean => {
      const split = splitSongKey(song.songKey);
      if (split === null || bucketOrigin === null) return false;
      currentRef.current = song.songKey;
      playSnapshot(song.snapshot, split.source, split.externalId, bucketOrigin);
      return true;
    },
    [playSnapshot, bucketOrigin],
  );

  const onRowTap = useCallback(
    (song: BucketDetailSong) => {
      // Manual tap clears any active auto-advance queue so the next
      // "completed" event does not silently chain into the bucket's
      // next song after the user picked their own track.
      queueRef.current = null;
      indexRef.current = 0;
      playRow(song);
    },
    [playRow],
  );

  const onPlayAll = useCallback(() => {
    if (songs.length === 0) return;
    queueRef.current = songs;
    indexRef.current = 0;
    playRow(songs[0]!);
  }, [songs, playRow]);

  // Auto-advance: when the engine flips to "ended" for the queue's
  // current song, kick the next one. The effect runs on every
  // engineState change, but the inner body short-circuits unless the
  // ended track is the one we just started and there's still queue
  // left.
  useEffect(() => {
    if (engineState.status !== "ended") return;
    const queue = queueRef.current;
    if (queue === null) return;
    const expected = currentRef.current;
    const playingTitle = engineState.currentTrack?.snapshot.title ?? null;
    // The engine's currentTrack stays loaded after "ended", so we
    // identify "this is the queued song" by matching its title to the
    // queue position's title — both are server-emitted and stable.
    if (expected === null || queue[indexRef.current]?.snapshot.title !== playingTitle) {
      return;
    }
    const next = indexRef.current + 1;
    if (next >= queue.length) {
      // Queue drained — clear so a subsequent manual play does not
      // accidentally re-fire the auto-advance.
      queueRef.current = null;
      indexRef.current = 0;
      currentRef.current = null;
      return;
    }
    indexRef.current = next;
    playRow(queue[next]!);
  }, [engineState, playRow]);

  // Header is shared across every state so the back affordance is
  // always one tap away (UI-37 / BROWSER-08).
  const header = (
    <header className="flex items-center px-4 py-3">
      <IconButton aria-label="Back to Taste" onClick={goBack} variant="default" size="sm">
        <span aria-hidden>←</span>
      </IconButton>
    </header>
  );

  if (state.status === "loading") {
    return (
      <main className="flex flex-col min-h-full" aria-busy="true">
        {header}
        <div className="flex-1 flex items-center justify-center p-8">
          <Typography variant="body" className="text-text-muted">
            Loading…
          </Typography>
        </div>
      </main>
    );
  }

  if (state.status === "not-found") {
    return (
      <main className="flex flex-col min-h-full">
        {header}
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4 text-center">
          <Typography variant="h2">Bucket not found</Typography>
          <Typography variant="body" className="text-text-muted">
            This bucket may have been removed or never existed.
          </Typography>
          <Button variant="primary" size="md" onClick={goBack} aria-label="Back to Taste">
            Back to Taste
          </Button>
        </div>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="flex flex-col min-h-full">
        {header}
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4 text-center">
          <Typography variant="body" className="text-text-muted">
            Couldn&apos;t load this bucket.
          </Typography>
          <Button variant="primary" size="md" onClick={refresh}>
            Try again
          </Button>
        </div>
      </main>
    );
  }

  // Ready bucket: state.data is set.
  const data = state.data;
  const isReady = data.bucket.state === "ready";
  const isBuilding = data.bucket.state === "building";
  const isFailed = data.bucket.state === "failed";
  const playingSongKey = engineState.currentTrack?.snapshot.title ?? null;
  const isPlayingSongKey = (songKey: string): boolean => {
    const song = songs.find((s) => s.songKey === songKey);
    return song !== undefined && song.snapshot.title === playingSongKey;
  };

  return (
    <main className="flex flex-col min-h-full">
      {header}
      <div className="flex-1 overflow-y-auto">
        {isBuilding ? (
          <BucketBuildingShell bucket={data.bucket} />
        ) : isFailed ? (
          <BucketFailedShell bucket={data.bucket} />
        ) : (
          <>
            <BucketHero
              bucket={data.bucket}
              songCount={data.songs.length}
              showPlayAll={isReady && data.songs.length >= 1}
              onPlayAll={onPlayAll}
            />
            <BucketSongList
              songs={data.songs}
              providerOf={providerLabelOf}
              isPlayingSongKey={isPlayingSongKey}
              onRowTap={onRowTap}
            />
          </>
        )}
      </div>
    </main>
  );
}

function BucketBuildingShell({ bucket }: { bucket: TasteBucket }): JSX.Element {
  return (
    <section className="flex flex-col items-center text-center px-6 py-2 pb-6">
      <Typography variant="h1" className="mb-1 mt-4">
        {bucket.name}
      </Typography>
      <Typography variant="caption" className="text-text-muted italic">
        Building…
      </Typography>
    </section>
  );
}

function BucketFailedShell({ bucket }: { bucket: TasteBucket }): JSX.Element {
  const reason = bucket.errorReason ?? "Mix failed to build";
  return (
    <section className="flex flex-col items-center text-center px-6 py-2 pb-6">
      <Typography variant="h1" className="mb-1 mt-4">
        {bucket.name}
      </Typography>
      <Typography
        variant="body"
        className="text-text-muted"
        data-testid="bucket-detail-failed-reason"
      >
        {reason}
      </Typography>
    </section>
  );
}
