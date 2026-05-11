import { IconButton, Icon } from "@moc/design-system";

interface ActionRowProps {
  isPlaying: boolean;
  disabled: boolean;
  onPass: () => void;
  onTogglePlay: () => void;
  onLike: () => void;
}

/**
 * Three large IconButtons under the swipe deck — pass / pause-or-play / like.
 * No text labels per the design review (aria-label only).
 */
export function ActionRow({
  isPlaying,
  disabled,
  onPass,
  onTogglePlay,
  onLike,
}: ActionRowProps): JSX.Element {
  return (
    <div data-testid="explore-action-row" className="flex items-center justify-around h-20 px-6">
      <IconButton aria-label="Pass" variant="danger" size="lg" onClick={onPass} disabled={disabled}>
        <Icon name="x" size={24} />
      </IconButton>
      <IconButton
        aria-label={isPlaying ? "Pause preview" : "Play preview"}
        variant="default"
        size="lg"
        onClick={onTogglePlay}
        disabled={disabled}
      >
        <Icon name={isPlaying ? "pause" : "play"} size={24} />
      </IconButton>
      <IconButton
        aria-label="Like"
        variant="success"
        size="lg"
        onClick={onLike}
        disabled={disabled}
      >
        <Icon name="heart-filled" size={24} />
      </IconButton>
    </div>
  );
}
