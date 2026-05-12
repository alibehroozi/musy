import { useState } from "react";
import { Button, Icon } from "@moc/design-system";
import type { SongSnapshot } from "@moc/contracts";
import { usePlayer } from "../usePlayer.js";
import { reresolveAndReplay, resolveStream } from "../api.js";

interface BadRemixButtonProps {
  snapshot: SongSnapshot;
  // When known, the caller passes the sourceTrackId currently playing for
  // this snapshot (Now Playing reads it from currentSource.externalId).
  // When undefined (Explore card, where currentSource isn't populated for
  // preview playback), the button derives it via a one-shot /play/resolve
  // call before issuing /play/reresolve.
  currentSourceTrackId?: string;
  // Optional class hook so the Explore card cover can absolute-position it
  // over the artwork while the Now Playing overlay places it inline.
  className?: string;
}

/**
 * UI-32: "Bad remix" — small secondary button that asks the API to rotate
 * the current SoundCloud resolution for this snapshot to the next-most-played
 * un-tried candidate and replays the same snapshot with the new stream URL.
 * The active SongSnapshot identity is preserved across the call; only the
 * underlying source track changes.
 *
 * Built from the design-system Button (variant="secondary" size="sm") +
 * Icon (name="thumbs-down"). Uses the design-system primitive — no raw
 * HTML button — per hard rule #14.
 */
export function BadRemixButton({
  snapshot,
  currentSourceTrackId,
  className,
}: BadRemixButtonProps): JSX.Element {
  const { loadPreview } = usePlayer();
  const [busy, setBusy] = useState(false);

  const handleClick = (): void => {
    if (busy) return;
    setBusy(true);
    void (async () => {
      try {
        let currentId = currentSourceTrackId;
        if (currentId === undefined) {
          const current = await resolveStream({ snapshot });
          if (current.sourceTrackId === null) return;
          currentId = current.sourceTrackId;
        }
        const next = await reresolveAndReplay(snapshot, currentId);
        if (next.streamUrl !== null) {
          // Same snapshot, new stream — keeps the active track identity
          // (UI-32) so the title/artist render unchanged while the audio
          // source rotates underneath. loadPreview re-uses the player's
          // existing crossfade.
          loadPreview(snapshot, next.streamUrl);
        }
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      aria-label="Bad remix"
      disabled={busy}
      onClick={handleClick}
      {...(className !== undefined ? { className } : {})}
    >
      <Icon name="thumbs-down" size={14} />
      <span>Bad remix</span>
    </Button>
  );
}
