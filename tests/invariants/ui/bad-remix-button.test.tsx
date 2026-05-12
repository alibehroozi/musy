// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-32.

import { describe, it } from "vitest";

describe("UI-32: Bad Remix button is present on Explore card cover AND Now Playing overlay; click preserves the active snapshot", () => {
  it.todo(
    "the Explore swipe card cover renders a button with accessible name 'Bad remix' (built from Button variant='secondary' size='sm' wrapping Icon name='thumbs-down')",
  );

  it.todo(
    "the Now Playing overlay renders a button with accessible name 'Bad remix' (built from Button variant='secondary' size='sm' wrapping Icon name='thumbs-down')",
  );

  it.todo(
    "clicking the Explore Bad Remix button does NOT unmount the player and the same SongSnapshot remains the active track after the network call resolves",
  );

  it.todo(
    "clicking the Now Playing Bad Remix button does NOT unmount the player and the same SongSnapshot remains the active track after the network call resolves",
  );

  it.todo(
    "the Bad Remix button is rendered with a design-system Button (no raw <button> element in apps/web/) — hard rule #14",
  );
});
