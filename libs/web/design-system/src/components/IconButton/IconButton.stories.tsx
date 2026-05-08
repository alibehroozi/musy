import { useState } from "react";
import { IconButton } from "./IconButton.js";

export function Default() {
  return (
    <IconButton label="Save">
      <span>♡</span>
    </IconButton>
  );
}

export function Filled() {
  return (
    <IconButton label="Saved" variant="filled">
      <span>♥</span>
    </IconButton>
  );
}

export function Toggle() {
  const [saved, setSaved] = useState(false);
  return (
    <IconButton
      label={saved ? "Saved" : "Save"}
      variant={saved ? "filled" : "default"}
      onClick={() => setSaved((v) => !v)}
    >
      <span>{saved ? "♥" : "♡"}</span>
    </IconButton>
  );
}
