// Layer 3 — Playwright required.
// These tests are stubs until the Playwright harness runs against the
// running dev server. See INVARIANTS.md: PWA-03.

import { describe, it } from "vitest";

describe("PWA-03: manifest + iOS meta shape", () => {
  it.todo(
    "/manifest.webmanifest parses as JSON with name, short_name, start_url='/', display='standalone'",
  );
  it.todo(
    "manifest icons include ≥1 192x192 PNG, ≥1 512x512 PNG, ≥1 with purpose containing 'maskable'",
  );
  it.todo(
    "served index.html has <link rel='apple-touch-icon'> and <meta name='apple-mobile-web-app-capable' content='yes'>",
  );
});
