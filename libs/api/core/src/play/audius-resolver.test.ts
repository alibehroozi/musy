import { describe, it, expect } from "vitest";
import type { SongSnapshot } from "@moc/contracts";
import {
  passesReResolveCandidacy,
  passesSimilarity,
  type AudiusCandidate,
} from "./audius-resolver.js";

function snap(overrides: Partial<SongSnapshot> = {}): SongSnapshot {
  return {
    title: overrides.title ?? "vampire",
    artist: overrides.artist ?? "Olivia Rodrigo",
    kind: overrides.kind ?? "track",
    ...(overrides.durationSec !== undefined ? { durationSec: overrides.durationSec } : {}),
  };
}

function cand(overrides: Partial<AudiusCandidate> = {}): AudiusCandidate {
  return {
    id: overrides.id ?? "id-1",
    title: overrides.title ?? "vampire",
    artist: overrides.artist ?? "Olivia Rodrigo",
    durationSec: overrides.durationSec ?? 220,
  };
}

describe("passesReResolveCandidacy — Bad Remix candidate filter", () => {
  it("accepts an exact title + artist match (the primary path)", () => {
    expect(passesReResolveCandidacy(snap(), cand())).toBe(true);
  });

  it("accepts a candidate whose artist field is unrelated when the original artist appears in its title", () => {
    // Real-world pattern: a SoundCloud user uploads the song under their own
    // account name. passesSimilarity rejects this; passesReResolveCandidacy
    // accepts it because "olivia" / "rodrigo" appear in the candidate title.
    const c = cand({
      id: "user-upload",
      title: "Olivia Rodrigo - vampire (Official Audio)",
      artist: "LyricLand",
    });
    expect(passesSimilarity(snap(), c)).toBe(false);
    expect(passesReResolveCandidacy(snap(), c)).toBe(true);
  });

  it("rejects a different song that shares a title word but neither matches the artist nor mentions it", () => {
    // "Vampire Diaries Theme Song" is NOT a re-resolution of Olivia Rodrigo's
    // "vampire". The artist token must appear somewhere — title or artist —
    // for the candidate to be accepted.
    const c = cand({
      id: "vampire-diaries",
      title: "Vampire Diaries Theme Song",
      artist: "TVMusicChannel",
    });
    expect(passesReResolveCandidacy(snap(), c)).toBe(false);
  });

  it("rejects when the title is too different even if the artist matches", () => {
    // Title gate is hard — a song titled "good 4 u" by Olivia Rodrigo is a
    // different song; we don't accept it as a re-resolution of "vampire".
    const c = cand({
      id: "different-song",
      title: "good 4 u",
      artist: "Olivia Rodrigo",
    });
    expect(passesReResolveCandidacy(snap(), c)).toBe(false);
  });

  it("falls through to false when snapshot.artist is empty (no token to match in title)", () => {
    const s = snap({ artist: "" });
    const c = cand({ title: "vampire", artist: "Some Channel" });
    // No artist tokens → can't fall back via the title-contains heuristic,
    // and artist jaccard is 1.0 vs the candidate's non-empty artist.
    expect(passesReResolveCandidacy(s, c)).toBe(false);
  });

  it("is more permissive than passesSimilarity across the un-tried Bad Remix candidate pool", () => {
    const snapshot = snap({ title: "vampire", artist: "Olivia Rodrigo" });
    const pool: AudiusCandidate[] = [
      // 1: exact match. Strict + lenient.
      { id: "1", title: "vampire", artist: "Olivia Rodrigo", durationSec: 220 },
      // 2: fan upload (artist is the SoundCloud account, real artist in title).
      // Strict REJECTS (artist jaccard 1.0); lenient ACCEPTS via title-contains.
      {
        id: "2",
        title: "Olivia Rodrigo - vampire (Audio)",
        artist: "MusicVibes",
        durationSec: 220,
      },
      // 3: official live upload with extended artist. Strict + lenient both
      // accept ("olivia rodrigo" is a subset of "olivia rodrigo live").
      {
        id: "3",
        title: "vampire (live at the Grammys)",
        artist: "olivia rodrigo live",
        durationSec: 250,
      },
      // 4: different Olivia Rodrigo song. Title gate rejects (jaccard 1.0).
      { id: "4", title: "good 4 u", artist: "Olivia Rodrigo", durationSec: 178 },
      // 5: unrelated track that shares only the word "vampire". Title gate
      // accepts but artist neither matches nor appears in the title — both
      // predicates reject.
      { id: "5", title: "Vampire Diaries Theme", artist: "TVMusic", durationSec: 60 },
    ];
    const strict = pool.filter((c) => passesSimilarity(snapshot, c));
    const lenient = pool.filter((c) => passesReResolveCandidacy(snapshot, c));
    // The fan-upload case (id 2) is exactly what was missing for Bad Remix —
    // a real candidate the strict predicate dropped.
    expect(strict.map((c) => c.id).sort()).toEqual(["1", "3"]);
    expect(lenient.map((c) => c.id).sort()).toEqual(["1", "2", "3"]);
  });

  it("ignores duration so re-resolution can surface uploads of different lengths", () => {
    const s = snap({ durationSec: 220 });
    const c = cand({ id: "long-outro", durationSec: 280 });
    // passesSimilarity would reject this on the duration check; the Bad Remix
    // predicate intentionally does not.
    expect(passesSimilarity(s, c)).toBe(false);
    expect(passesReResolveCandidacy(s, c)).toBe(true);
  });
});
