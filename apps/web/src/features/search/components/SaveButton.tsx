import { type MouseEvent, useState } from "react";
import { Icon, IconButton } from "@moc/design-system";

interface SaveButtonProps {
  /** Whether the row is currently saved (optimistic local state). */
  saved: boolean;
  /** Called when the user taps the button. */
  onSave: () => void;
}

/**
 * Trailing add/heart button on a result row. Optimistic: flips to
 * filled the moment the user taps; the underlying POST is fire-and-
 * forget. Per the product spec, transient failures don't roll back.
 *
 * The button stops click propagation so the row's onTap handler
 * doesn't also fire ("explored") when the user means to save.
 */
export function SaveButton({ saved, onSave }: SaveButtonProps): JSX.Element {
  const [optimistic, setOptimistic] = useState(saved);
  const isSaved = saved || optimistic;

  const handleClick = (e: MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    setOptimistic(true);
    onSave();
  };

  return (
    <IconButton
      variant={isSaved ? "filled" : "default"}
      aria-label={isSaved ? "Saved" : "Save"}
      aria-pressed={isSaved}
      onClick={handleClick}
      data-testid="save-button"
    >
      <Icon name={isSaved ? "heart-filled" : "heart"} size={20} />
    </IconButton>
  );
}
