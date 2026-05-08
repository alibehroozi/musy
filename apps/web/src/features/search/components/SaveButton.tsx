import { useState } from "react";
import { IconButton, Icon } from "@moc/design-system";

interface SaveButtonProps {
  onSave: () => void;
}

export function SaveButton({ onSave }: SaveButtonProps): JSX.Element {
  const [saved, setSaved] = useState(false);

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    setSaved(true);
    onSave();
  }

  return (
    <IconButton
      variant={saved ? "filled" : "default"}
      size="sm"
      label={saved ? "Saved" : "Save"}
      onClick={handleClick}
      data-testid="save-button"
    >
      <Icon name="heart" size={18} />
    </IconButton>
  );
}
