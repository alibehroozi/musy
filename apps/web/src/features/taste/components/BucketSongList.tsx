import { Button, ResultRow } from "@moc/design-system";
import type { BucketDetailSong } from "@moc/contracts";

interface BucketSongListProps {
  songs: readonly BucketDetailSong[];
  /** Source label per song, derived from its songKey prefix. */
  providerOf: (songKey: string) => string;
  /** True iff this songKey is the one currently playing. */
  isPlayingSongKey: (songKey: string) => boolean;
  onRowTap: (song: BucketDetailSong) => void;
}

/**
 * UI-37: the bucket-detail song list. Uses the existing `ResultRow`
 * design-system component with NO trailing slot — bucket rows don't
 * surface save / remove / reorder in v1. Tap delegates to `onRowTap`
 * which the page wires into `playSnapshot(..., { bucketId, bucketKind })`.
 *
 * Renders an empty-state `<p>` per the spec ("(no songs yet)") when
 * `songs.length === 0`.
 */
export function BucketSongList({
  songs,
  providerOf,
  isPlayingSongKey,
  onRowTap,
}: BucketSongListProps): JSX.Element {
  if (songs.length === 0) {
    return (
      <p
        className="text-sm text-text-muted italic px-4 py-2"
        data-testid="bucket-detail-empty-list"
      >
        (no songs yet)
      </p>
    );
  }
  return (
    <ul
      role="list"
      className="flex flex-col list-none p-0 m-0"
      data-testid="bucket-detail-song-list"
    >
      {songs.map((song) => {
        const playing = isPlayingSongKey(song.songKey);
        const cover = song.snapshot.coverUrl;
        return (
          <li key={song.songKey} role="listitem" className="m-0 p-0">
            <Button
              variant="ghost"
              size="md"
              onClick={() => onRowTap(song)}
              aria-label={`Play ${song.snapshot.title} by ${song.snapshot.artist}`}
              className="w-full text-left p-0 hover:bg-surface items-stretch justify-start"
            >
              <ResultRow
                variant="track"
                title={song.snapshot.title}
                artist={song.snapshot.artist}
                {...(song.snapshot.year !== undefined ? { year: song.snapshot.year } : {})}
                {...(song.snapshot.durationSec !== undefined
                  ? { duration: song.snapshot.durationSec }
                  : {})}
                {...(cover !== undefined ? { artworkUrl: cover } : {})}
                sourceBadge={providerOf(song.songKey)}
                playingOverlay={playing}
              />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
