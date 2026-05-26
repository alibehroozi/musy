// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PRIVACY-17.

import { describe, it } from "vitest";

describe("PRIVACY-17: highBucketSamples is capped at 10 entries and not sorted by score", () => {
  it.todo(
    "buildRelatedArtistsPrompt with > 10 high-bucket samples only forwards 10 in the prompt body",
  );
  it.todo("the 10 forwarded entries are {title, artist} only — no score values");
  it.todo("the prompt body does not contain a score field for any high-bucket sample entry");
});
