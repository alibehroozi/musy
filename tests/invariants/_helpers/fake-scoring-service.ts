import type { ProviderName, SongSnapshot, SwipeDirection } from "@moc/contracts";

/**
 * In-memory stand-in for ScoringService. The contextual-scoring write
 * path is a fire-and-forget side-effect of the existing event paths —
 * tests that focus on the source-of-truth ledgers (swipes, listening
 * events, interest scores) don't need real Mongo writes; they care
 * about (a) the call happened with the right userId (SEC-13) and
 * (b) the call didn't throw and disturb the ledger write.
 *
 * Each public method matches the production ScoringService surface
 * and records the call so SEC-13 tests can assert on the userId.
 */
export class FakeScoringService {
  swipeCalls: { userId: string; snapshot: SongSnapshot; direction: SwipeDirection }[] = [];
  saveCalls: { userId: string; source: ProviderName; externalId: string }[] = [];
  listenCompletedCalls: {
    userId: string;
    source: ProviderName;
    externalId: string;
    snapshot: SongSnapshot;
    elapsedMs: number;
  }[] = [];

  async recordSwipe(input: {
    userId: string;
    snapshot: SongSnapshot;
    direction: SwipeDirection;
  }): Promise<void> {
    this.swipeCalls.push({ ...input });
  }

  async recordSave(input: {
    userId: string;
    source: ProviderName;
    externalId: string;
  }): Promise<void> {
    this.saveCalls.push({ ...input });
  }

  async recordListenCompleted(input: {
    userId: string;
    source: ProviderName;
    externalId: string;
    snapshot: SongSnapshot;
    elapsedMs: number;
  }): Promise<void> {
    this.listenCompletedCalls.push({ ...input });
  }
}
