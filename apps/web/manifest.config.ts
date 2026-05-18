/**
 * Web App Manifest for moc/musy (PWA-03).
 *
 * Exported as a typed object so the vite-plugin-pwa config in
 * `vite.config.ts` and the Layer-2 invariant test in
 * `tests/invariants/pwa/manifest.test.ts` consume the same source of
 * truth. Drift between "what we ship" and "what we assert" was the
 * whole reason PWA-03 exists — keep this file the single source.
 *
 * iOS Safari ignores the manifest. The iOS-only meta tags live in
 * `apps/web/index.html` and are asserted there directly.
 */

import type { ManifestOptions } from "vite-plugin-pwa";

export const pwaManifest = {
  id: "/",
  name: "musy",
  short_name: "musy",
  description: "Music app with AI-powered taste processing",
  theme_color: "#000000",
  background_color: "#000000",
  display: "standalone",
  display_override: ["standalone"],
  start_url: "/",
  scope: "/",
  orientation: "portrait",
  categories: ["music", "entertainment", "lifestyle"],
  icons: [
    { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
    { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
    { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
    {
      src: "maskable-icon-512x512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
} as const satisfies Partial<ManifestOptions>;
