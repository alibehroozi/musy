// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-05, DATA-06, DATA-07.

import { describe, it, expect } from "vitest";
import type { SongSnapshot } from "@moc/contracts";
import { InterestScoresSchemaDefinition } from "../../../apps/api/src/modules/search/interest-scores.schema.js";
import { FakeInterestScoresRepository } from "../_helpers/search-events-test-app.js";

const ALICE = "550e8400-e29b-41d4-a716-446655440100";
const SNAPSHOT_A: SongSnapshot = {
  title: "Get Lucky",
  artist: "Daft Punk",
  kind: "track",
};
const SNAPSHOT_B: SongSnapshot = {
  title: "DIFFERENT TITLE",
  artist: "DIFFERENT ARTIST",
  kind: "track",
};

describe("DATA-05: interest_scores has a unique compound index (userId, songKey); duplicate events produce one document", () => {
  it("schema declares a unique compound index on (userId, songKey)", () => {
    const indexes = InterestScoresSchemaDefinition.indexes();
    const compound = indexes.find(([fields]) => {
      const f = fields as Record<string, unknown>;
      return "userId" in f && "songKey" in f;
    });
    expect(compound).toBeDefined();
    const opts = compound?.[1] as Record<string, unknown> | undefined;
    expect(opts?.["unique"]).toBe(true);
  });

  it("schema marks songKey, userId, source, externalId as required", () => {
    const paths = InterestScoresSchemaDefinition.paths;
    expect(
      (paths["userId"] as unknown as { options?: { required?: unknown } }).options?.required,
    ).toBe(true);
    expect(
      (paths["songKey"] as unknown as { options?: { required?: unknown } }).options?.required,
    ).toBe(true);
    expect(
      (paths["source"] as unknown as { options?: { required?: unknown } }).options?.required,
    ).toBe(true);
    expect(
      (paths["externalId"] as unknown as { options?: { required?: unknown } }).options?.required,
    ).toBe(true);
  });

  it("two upserts for the same (userId, source, externalId) leave exactly one document", async () => {
    const repo = new FakeInterestScoresRepository();
    await repo.upsertEvent({
      userId: ALICE,
      source: "deezer",
      externalId: "1",
      snapshot: SNAPSHOT_A,
      eventType: "explored",
    });
    await repo.upsertEvent({
      userId: ALICE,
      source: "deezer",
      externalId: "1",
      snapshot: SNAPSHOT_A,
      eventType: "saved",
    });
    const docs = await repo.findScoresForUser(ALICE);
    expect(docs).toHaveLength(1);
    expect(docs[0]!.songKey).toBe("deezer:1");
  });
});

describe("DATA-06: interest_scores.score is monotonically non-decreasing per (userId, songKey) — max-rule", () => {
  it("first 'explored' event sets score = 3", async () => {
    const repo = new FakeInterestScoresRepository();
    await repo.upsertEvent({
      userId: ALICE,
      source: "deezer",
      externalId: "1",
      snapshot: SNAPSHOT_A,
      eventType: "explored",
    });
    const [doc] = await repo.findScoresForUser(ALICE);
    expect(doc!.score).toBe(3);
  });

  it("subsequent 'saved' event raises score to 8", async () => {
    const repo = new FakeInterestScoresRepository();
    await repo.upsertEvent({
      userId: ALICE,
      source: "deezer",
      externalId: "1",
      snapshot: SNAPSHOT_A,
      eventType: "explored",
    });
    await repo.upsertEvent({
      userId: ALICE,
      source: "deezer",
      externalId: "1",
      snapshot: SNAPSHOT_A,
      eventType: "saved",
    });
    const [doc] = await repo.findScoresForUser(ALICE);
    expect(doc!.score).toBe(8);
    expect(doc!.lastEventType).toBe("saved");
  });

  it("subsequent 'explored' event after a 'saved' leaves score at 8 (does not drop to 3)", async () => {
    const repo = new FakeInterestScoresRepository();
    await repo.upsertEvent({
      userId: ALICE,
      source: "deezer",
      externalId: "1",
      snapshot: SNAPSHOT_A,
      eventType: "saved",
    });
    await repo.upsertEvent({
      userId: ALICE,
      source: "deezer",
      externalId: "1",
      snapshot: SNAPSHOT_A,
      eventType: "explored",
    });
    const [doc] = await repo.findScoresForUser(ALICE);
    expect(doc!.score).toBe(8);
    // lastEventType reflects the most recent event; max-rule only constrains score.
    expect(doc!.lastEventType).toBe("explored");
  });
});

describe("DATA-07: interest_scores.snapshot is written on first event and never overwritten", () => {
  it("first event persists the snapshot fields verbatim", async () => {
    const repo = new FakeInterestScoresRepository();
    await repo.upsertEvent({
      userId: ALICE,
      source: "deezer",
      externalId: "1",
      snapshot: SNAPSHOT_A,
      eventType: "explored",
    });
    const [doc] = await repo.findScoresForUser(ALICE);
    expect(doc!.snapshot).toEqual(SNAPSHOT_A);
  });

  it("second event with a different snapshot leaves the stored snapshot unchanged", async () => {
    const repo = new FakeInterestScoresRepository();
    await repo.upsertEvent({
      userId: ALICE,
      source: "deezer",
      externalId: "1",
      snapshot: SNAPSHOT_A,
      eventType: "explored",
    });
    await repo.upsertEvent({
      userId: ALICE,
      source: "deezer",
      externalId: "1",
      snapshot: SNAPSHOT_B,
      eventType: "saved",
    });
    const [doc] = await repo.findScoresForUser(ALICE);
    expect(doc!.snapshot).toEqual(SNAPSHOT_A);
  });
});
