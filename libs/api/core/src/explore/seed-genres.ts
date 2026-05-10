import type { SongSnapshot } from "@moc/contracts";

/**
 * Hand-curated seed list driving the Phase 1 ("discovery") queue. 12
 * broad genres × 2 (one mainstream + one niche) = 24 snapshots. The
 * mainstream candidate reveals whether the user even likes the genre;
 * the niche candidate reveals whether they like it at depth (only
 * people who actually like genre X tend to enjoy obscure X).
 *
 * Snapshots are committed code, not provider-resolved at runtime — a
 * brand-new user's first queue therefore needs zero outgoing calls.
 * Title / artist text mirrors well-known and credibly-niche tracks per
 * genre; consumers (the queue builder) ignore the order here and apply
 * their own shuffle / dedupe against `swipes.snapshotHash`.
 */
export interface SeedEntry {
  genre: string;
  popularity: "mainstream" | "niche";
  snapshot: SongSnapshot;
}

const seed: ReadonlyArray<SeedEntry> = [
  // Pop
  {
    genre: "pop",
    popularity: "mainstream",
    snapshot: { title: "Blinding Lights", artist: "The Weeknd", kind: "track" },
  },
  {
    genre: "pop",
    popularity: "niche",
    snapshot: { title: "Pink + White", artist: "Frank Ocean", kind: "track" },
  },
  // Rock
  {
    genre: "rock",
    popularity: "mainstream",
    snapshot: { title: "Bohemian Rhapsody", artist: "Queen", kind: "track" },
  },
  {
    genre: "rock",
    popularity: "niche",
    snapshot: { title: "Marquee Moon", artist: "Television", kind: "track" },
  },
  // Hip-hop
  {
    genre: "hip-hop",
    popularity: "mainstream",
    snapshot: { title: "HUMBLE.", artist: "Kendrick Lamar", kind: "track" },
  },
  {
    genre: "hip-hop",
    popularity: "niche",
    snapshot: { title: "Fall in Love", artist: "Slum Village", kind: "track" },
  },
  // Electronic / house
  {
    genre: "house",
    popularity: "mainstream",
    snapshot: { title: "One More Time", artist: "Daft Punk", kind: "track" },
  },
  {
    genre: "house",
    popularity: "niche",
    snapshot: { title: "Strings of Life", artist: "Derrick May", kind: "track" },
  },
  // Techno
  {
    genre: "techno",
    popularity: "mainstream",
    snapshot: { title: "Spastik", artist: "Plastikman", kind: "track" },
  },
  {
    genre: "techno",
    popularity: "niche",
    snapshot: { title: "Acid Indigestion", artist: "Aphex Twin", kind: "track" },
  },
  // Drum and bass
  {
    genre: "drum-and-bass",
    popularity: "mainstream",
    snapshot: { title: "Inner City Life", artist: "Goldie", kind: "track" },
  },
  {
    genre: "drum-and-bass",
    popularity: "niche",
    snapshot: { title: "Atlantis (I Need You)", artist: "LTJ Bukem", kind: "track" },
  },
  // Jazz
  {
    genre: "jazz",
    popularity: "mainstream",
    snapshot: { title: "So What", artist: "Miles Davis", kind: "track" },
  },
  {
    genre: "jazz",
    popularity: "niche",
    snapshot: { title: "Black Narcissus", artist: "Joe Henderson", kind: "track" },
  },
  // R&B / soul
  {
    genre: "r&b",
    popularity: "mainstream",
    snapshot: { title: "Cranes in the Sky", artist: "Solange", kind: "track" },
  },
  {
    genre: "r&b",
    popularity: "niche",
    snapshot: { title: "Just Friends (Sunny)", artist: "Musiq Soulchild", kind: "track" },
  },
  // Indie / alternative
  {
    genre: "indie",
    popularity: "mainstream",
    snapshot: { title: "Mr. Brightside", artist: "The Killers", kind: "track" },
  },
  {
    genre: "indie",
    popularity: "niche",
    snapshot: { title: "The Modern Leper", artist: "Frightened Rabbit", kind: "track" },
  },
  // Metal
  {
    genre: "metal",
    popularity: "mainstream",
    snapshot: { title: "Master of Puppets", artist: "Metallica", kind: "track" },
  },
  {
    genre: "metal",
    popularity: "niche",
    snapshot: { title: "Bleeding Out", artist: "Blood Incantation", kind: "track" },
  },
  // Country / folk
  {
    genre: "country",
    popularity: "mainstream",
    snapshot: { title: "Jolene", artist: "Dolly Parton", kind: "track" },
  },
  {
    genre: "country",
    popularity: "niche",
    snapshot: { title: "Hard Times", artist: "Gillian Welch", kind: "track" },
  },
  // Ambient / electronic
  {
    genre: "ambient",
    popularity: "mainstream",
    snapshot: { title: "An Ending (Ascent)", artist: "Brian Eno", kind: "track" },
  },
  {
    genre: "ambient",
    popularity: "niche",
    snapshot: { title: "Avril 14th", artist: "Aphex Twin", kind: "track" },
  },
];

export const SEED_ENTRIES: ReadonlyArray<SeedEntry> = seed;

export function seedSnapshots(): SongSnapshot[] {
  return SEED_ENTRIES.map((e) => e.snapshot);
}
