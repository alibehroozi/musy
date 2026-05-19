// Layer 2 — reads the source-of-truth manifest config + raw index.html.
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PWA-03.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { pwaManifest } from "../../../apps/web/manifest.config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_HTML_PATH = resolve(__dirname, "../../../apps/web/index.html");
const indexHtml = readFileSync(INDEX_HTML_PATH, "utf-8");

describe("PWA-03: manifest + iOS meta shape", () => {
  it("declares name, short_name, start_url='/', display='standalone', and theme/background colors", () => {
    expect(pwaManifest.name).toBe("musy");
    expect(pwaManifest.short_name).toBe("musy");
    expect(pwaManifest.start_url).toBe("/");
    expect(pwaManifest.display).toBe("standalone");
    expect(pwaManifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(pwaManifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("includes >= 1 192x192 PNG icon", () => {
    const icon192 = pwaManifest.icons.find((i) => i.sizes === "192x192" && i.type === "image/png");
    expect(icon192, "manifest needs at least one 192x192 PNG icon").toBeDefined();
  });

  it("includes >= 1 512x512 PNG icon", () => {
    const icon512 = pwaManifest.icons.find((i) => i.sizes === "512x512" && i.type === "image/png");
    expect(icon512, "manifest needs at least one 512x512 PNG icon").toBeDefined();
  });

  it("includes >= 1 icon with purpose containing 'maskable'", () => {
    const maskable = pwaManifest.icons.find(
      (i) => "purpose" in i && typeof i.purpose === "string" && i.purpose.includes("maskable"),
    );
    expect(
      maskable,
      "manifest needs at least one maskable icon for Android adaptive icons",
    ).toBeDefined();
  });

  it("declares scope '/' and id '/' so the installed PWA opens at the app root", () => {
    expect(pwaManifest.scope).toBe("/");
    expect(pwaManifest.id).toBe("/");
  });

  it("index.html declares <link rel='apple-touch-icon'>", () => {
    expect(indexHtml).toMatch(/<link[^>]*rel=["']apple-touch-icon["'][^>]*>/);
  });

  it("index.html declares <meta name='apple-mobile-web-app-capable' content='yes'>", () => {
    expect(indexHtml).toMatch(
      /<meta[^>]*name=["']apple-mobile-web-app-capable["'][^>]*content=["']yes["']/,
    );
  });

  it("index.html declares an apple-mobile-web-app-status-bar-style so the iOS chrome blends with the dark theme", () => {
    expect(indexHtml).toMatch(
      /<meta[^>]*name=["']apple-mobile-web-app-status-bar-style["'][^>]*content=["'][^"']+["']/,
    );
  });
});
