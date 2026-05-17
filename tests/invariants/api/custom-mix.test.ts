// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-26, API-27.
//
// Real-upstream policy (AGENTS.md hard rule #15): the Anthropic client is
// mocked here because the feature-05 spec explicitly authorizes mocking
// for failure-mode tests, and the happy-path test stages a deterministic
// response. The spec line is the override:
//
//   > **Real-upstream policy:** same as feature 04 — Anthropic tests hit
//   > the real API; the 5xx and timeout tests are the explicit mocks,
//   > quoting this spec line.

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { ErrorResponse, CustomMixCreatedResponse, TasteBucketsResponse } from "@moc/contracts";

import {
  buildCustomMixTestApp,
  seedRightSwipes,
  type CustomMixTestAppHandle,
} from "../_helpers/custom-mix-test-app.js";

async function flushAsync(): Promise<void> {
  // Two microtask flushes — the fire-and-forget runBuild promise chains
  // a few awaits before it settles (Anthropic call → parse → DB writes).
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe("API-26: POST /api/me/taste/custom-mix HTTP contract", () => {
  let h: CustomMixTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("returns 401 + ErrorResponse without a session cookie", async () => {
    h = await buildCustomMixTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/me/taste/custom-mix")
      .send({ promptText: "dreamy" });
    expect(res.status).toBe(401);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("returns 400 + ErrorResponse for empty promptText", async () => {
    h = await buildCustomMixTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440b00";
    const token = h.authService.signSession({ uid: userId, gid: "g_cm_empty" });
    const res = await request(h.app.getHttpServer())
      .post("/api/me/taste/custom-mix")
      .set("Cookie", `session=${token}`)
      .send({ promptText: "" });
    expect(res.status).toBe(400);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
    expect(h.buckets.rows).toHaveLength(0);
    expect(h.jobs.rows).toHaveLength(0);
  });

  it("returns 400 + ErrorResponse for whitespace-only promptText", async () => {
    h = await buildCustomMixTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440b01";
    const token = h.authService.signSession({ uid: userId, gid: "g_cm_ws" });
    seedRightSwipes(h.swipes, userId, 10);
    const res = await request(h.app.getHttpServer())
      .post("/api/me/taste/custom-mix")
      .set("Cookie", `session=${token}`)
      .send({ promptText: "   \t \n " });
    expect(res.status).toBe(400);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
    expect(h.buckets.rows).toHaveLength(0);
  });

  it("returns 400 + ErrorResponse for promptText > 500 chars", async () => {
    h = await buildCustomMixTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440b02";
    const token = h.authService.signSession({ uid: userId, gid: "g_cm_long" });
    seedRightSwipes(h.swipes, userId, 5);
    const res = await request(h.app.getHttpServer())
      .post("/api/me/taste/custom-mix")
      .set("Cookie", `session=${token}`)
      .send({ promptText: "x".repeat(501) });
    expect(res.status).toBe(400);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("returns 422 + ErrorResponse when the user's positive-signal pool is empty", async () => {
    h = await buildCustomMixTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440b03";
    const token = h.authService.signSession({ uid: userId, gid: "g_cm_cold" });
    // No swipes seeded — pool is empty.
    const res = await request(h.app.getHttpServer())
      .post("/api/me/taste/custom-mix")
      .set("Cookie", `session=${token}`)
      .send({ promptText: "dreamy late night" });
    expect(res.status).toBe(422);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
    expect(h.buckets.rows).toHaveLength(0);
    expect(h.jobs.rows).toHaveLength(0);
  });

  it("returns 200 + CustomMixCreatedResponse and does NOT wait on Anthropic", async () => {
    h = await buildCustomMixTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440b04";
    const token = h.authService.signSession({ uid: userId, gid: "g_cm_ok" });
    seedRightSwipes(h.swipes, userId, 5);

    // Make the Anthropic call hang — if the controller awaits it, this
    // request never returns.
    let releaseAnthropic: (v: { text: string }) => void = () => {};
    const blocking = new Promise<{ text: string }>((resolve) => {
      releaseAnthropic = resolve;
    });
    h.anthropic.complete = (req) => {
      h!.anthropic.calls.push(req);
      return blocking;
    };

    const res = await request(h.app.getHttpServer())
      .post("/api/me/taste/custom-mix")
      .set("Cookie", `session=${token}`)
      .send({ promptText: "dreamy late night" });

    expect(res.status).toBe(200);
    const parsed = CustomMixCreatedResponse.parse(res.body);
    expect(parsed.jobId).toMatch(/^[0-9a-f-]+$/i);
    expect(parsed.bucketId).toMatch(/^[0-9a-f-]+$/i);

    // Pre-insert side effects: a building bucket + a building job exist.
    expect(h.buckets.rows).toHaveLength(1);
    expect(h.buckets.rows[0]!.kind).toBe("custom");
    expect(h.buckets.rows[0]!.state).toBe("building");
    expect(h.buckets.rows[0]!.promptText).toBe("dreamy late night");
    expect(h.jobs.rows).toHaveLength(1);
    expect(h.jobs.rows[0]!.state).toBe("building");

    // Release the hung Anthropic call so the fire-and-forget cleanup
    // doesn't leak between tests.
    releaseAnthropic({
      text: JSON.stringify({ name: "ignored", description: "", songs: [] }),
    });
    await flushAsync();
  });

  it("immediately after 200, GET /me/taste/profile lists the bucket in state=building with the submitted promptText", async () => {
    h = await buildCustomMixTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440b05";
    const token = h.authService.signSession({ uid: userId, gid: "g_cm_visible" });
    seedRightSwipes(h.swipes, userId, 5);

    // Keep Anthropic hung so we observe the state=building row.
    h.anthropic.complete = () => new Promise(() => {});

    const create = await request(h.app.getHttpServer())
      .post("/api/me/taste/custom-mix")
      .set("Cookie", `session=${token}`)
      .send({ promptText: "moody yacht rock" });
    expect(create.status).toBe(200);

    const get = await request(h.app.getHttpServer())
      .get("/api/me/taste/profile")
      .set("Cookie", `session=${token}`);
    expect(get.status).toBe(200);
    const profile = TasteBucketsResponse.parse(get.body);
    expect(profile.buckets).toHaveLength(1);
    expect(profile.buckets[0]!.state).toBe("building");
    expect(profile.buckets[0]!.kind).toBe("custom");
    expect(profile.buckets[0]!.promptText).toBe("moody yacht rock");
  });

  it("when the LLM responds with valid songs, the bucket flips to state=ready and bucket_song_scores rows exist", async () => {
    h = await buildCustomMixTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440b06";
    const token = h.authService.signSession({ uid: userId, gid: "g_cm_ready" });
    const seeded = seedRightSwipes(h.swipes, userId, 3);
    const llmText = JSON.stringify({
      name: "Yacht rock for summer",
      description: "Breezy mellow tracks",
      songs: seeded.map((s, i) => ({
        songKey: s.songKey,
        initialScore: 70 + i,
        sourceBuckets: [],
      })),
    });
    h.anthropic.response = { text: llmText };

    await request(h.app.getHttpServer())
      .post("/api/me/taste/custom-mix")
      .set("Cookie", `session=${token}`)
      .send({ promptText: "yacht rock" });

    await flushAsync();

    expect(h.buckets.rows).toHaveLength(1);
    expect(h.buckets.rows[0]!.state).toBe("ready");
    expect(h.buckets.rows[0]!.name).toBe("Yacht rock for summer");
    expect(h.bucketScores.rows).toHaveLength(3);
    expect(h.jobs.rows[0]!.state).toBe("completed");
    // sourceBuckets recorded per song.
    expect(h.jobs.rows[0]!.sourceBuckets).not.toBeNull();
  });

  it("when Anthropic rejects, the bucket flips to state=failed with non-null errorReason and no scores are written", async () => {
    h = await buildCustomMixTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440b07";
    const token = h.authService.signSession({ uid: userId, gid: "g_cm_fail" });
    seedRightSwipes(h.swipes, userId, 3);
    h.anthropic.rejectWith = new Error("simulated 5xx");

    await request(h.app.getHttpServer())
      .post("/api/me/taste/custom-mix")
      .set("Cookie", `session=${token}`)
      .send({ promptText: "doomed prompt" });

    await flushAsync();

    expect(h.buckets.rows[0]!.state).toBe("failed");
    expect(h.buckets.rows[0]!.errorReason).not.toBeNull();
    expect(h.bucketScores.rows).toHaveLength(0);
    expect(h.jobs.rows[0]!.state).toBe("failed");
  });

  it("when the LLM returns only songKeys not in the pool, all picks are dropped and the bucket is marked failed", async () => {
    h = await buildCustomMixTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440b08";
    const token = h.authService.signSession({ uid: userId, gid: "g_cm_bad_keys" });
    seedRightSwipes(h.swipes, userId, 3);
    h.anthropic.response = {
      text: JSON.stringify({
        name: "Ghost mix",
        description: "Hallucinated songs",
        songs: [
          { songKey: "snap:nope-1", initialScore: 60 },
          { songKey: "snap:nope-2", initialScore: 60 },
        ],
      }),
    };

    await request(h.app.getHttpServer())
      .post("/api/me/taste/custom-mix")
      .set("Cookie", `session=${token}`)
      .send({ promptText: "anything" });

    await flushAsync();

    expect(h.buckets.rows[0]!.state).toBe("failed");
    expect(h.buckets.rows[0]!.errorReason).toBe("model_returned_no_valid_songs");
    expect(h.bucketScores.rows).toHaveLength(0);
  });
});

describe("API-27: POST /api/me/taste/custom-mix concurrent-job rate limit", () => {
  let h: CustomMixTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("the 6th concurrent build for the same user returns 429", async () => {
    h = await buildCustomMixTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440c00";
    const token = h.authService.signSession({ uid: userId, gid: "g_cm_429" });
    seedRightSwipes(h.swipes, userId, 5);

    // Hang Anthropic so every build stays in `building`.
    h.anthropic.complete = () => new Promise(() => {});

    for (let i = 0; i < 5; i++) {
      const ok = await request(h.app.getHttpServer())
        .post("/api/me/taste/custom-mix")
        .set("Cookie", `session=${token}`)
        .send({ promptText: `prompt ${i}` });
      expect(ok.status).toBe(200);
    }

    const sixth = await request(h.app.getHttpServer())
      .post("/api/me/taste/custom-mix")
      .set("Cookie", `session=${token}`)
      .send({ promptText: "one too many" });
    expect(sixth.status).toBe(429);
    expect(() => ErrorResponse.parse(sixth.body)).not.toThrow();
    // No 6th bucket / job row was written.
    expect(h.buckets.rows.filter((r) => r.userId === userId)).toHaveLength(5);
    expect(h.jobs.rows.filter((r) => r.userId === userId)).toHaveLength(5);
  });

  it("the cap is per-user — user A's saturation does not affect user B", async () => {
    h = await buildCustomMixTestApp();
    const userA = "550e8400-e29b-41d4-a716-446655440c01";
    const userB = "550e8400-e29b-41d4-a716-446655440c02";
    const tokenA = h.authService.signSession({ uid: userA, gid: "g_cm_A" });
    const tokenB = h.authService.signSession({ uid: userB, gid: "g_cm_B" });
    seedRightSwipes(h.swipes, userA, 5);
    seedRightSwipes(h.swipes, userB, 5);

    h.anthropic.complete = () => new Promise(() => {});

    // Saturate user A.
    for (let i = 0; i < 5; i++) {
      const ok = await request(h.app.getHttpServer())
        .post("/api/me/taste/custom-mix")
        .set("Cookie", `session=${tokenA}`)
        .send({ promptText: `A${i}` });
      expect(ok.status).toBe(200);
    }
    // User B's first request still returns 200.
    const okB = await request(h.app.getHttpServer())
      .post("/api/me/taste/custom-mix")
      .set("Cookie", `session=${tokenB}`)
      .send({ promptText: "B0" });
    expect(okB.status).toBe(200);
  });
});
