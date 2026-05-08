import { defineConfig, devices } from "@playwright/test";

// Layer 2 visual regression — Playwright page snapshots.
//
// Snaps key routes against committed baselines under
// `tests/e2e/<page>.spec.ts-snapshots/`. PR review surfaces both code
// diffs and visual diffs; the human reviewer rejects either.
//
// Per AGENTS.md hard rule #12: a failing snapshot means the code is
// wrong by default. Regenerate baselines (`--update-snapshots`) only
// when the diff is unambiguously the intended change.
export default defineConfig({
  testDir: "./tests/e2e",
  // Visual snapshots are the slow ring — keep parallelism conservative
  // so flaky timing doesn't compound.
  fullyParallel: false,
  workers: 1,
  // Linux CI is the source-of-truth platform. Local mac runs use the
  // same baselines but may show font-rendering noise within the 0.01
  // expect threshold below; tighten if needed.
  expect: {
    toHaveScreenshot: {
      // Pixel diff threshold — 0.01 (1%) absorbs anti-aliasing noise.
      // Drop to 0 once we know the natural floor.
      maxDiffPixelRatio: 0.01,
    },
  },
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Spin up the dev server before the suite; reuse if already running.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
