// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-04.

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import {
  buildSearchTestApp,
  SEARCH_TEST_ENV,
  type SearchTestAppHandle,
} from "../_helpers/search-test-app.js";

describe("SEC-04: GENIUS_ACCESS_TOKEN never appears in any HTTP response body", () => {
  let h: SearchTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("the token value is not present in a successful POST /api/search response", async () => {
    h = await buildSearchTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/search")
      .send({ q: "daft punk" })
      .set("Content-Type", "application/json");
    const bodyText = JSON.stringify(res.body ?? "");
    expect(bodyText).not.toContain(SEARCH_TEST_ENV.GENIUS_ACCESS_TOKEN);
  });

  it("the token value is not present in a 400 error response from POST /api/search", async () => {
    h = await buildSearchTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/search")
      .send({ q: "" })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(400);
    const bodyText = JSON.stringify(res.body ?? "");
    expect(bodyText).not.toContain(SEARCH_TEST_ENV.GENIUS_ACCESS_TOKEN);
  });
});
