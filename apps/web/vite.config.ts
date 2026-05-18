import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig(({ mode }) => {
  // Load env from apps/web/.env.local + .env. Empty prefix loads all keys
  // (including non-VITE_ ones) into this build-time scope. Only VITE_*
  // values reach the browser bundle — see apps/web/.env.example.
  const env = loadEnv(mode, process.cwd(), "");
  const webPort = Number(env.VITE_WEB_PORT) || 5173;
  const apiTarget = env.VITE_API_TARGET || "http://localhost:3001";

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // The SW installs and immediately claims clients (skipWaiting +
        // clientsClaim are workbox defaults under autoUpdate). The
        // PwaController in apps/web/src/features/pwa wires the
        // user-facing update banner + visibility-change auto-apply on
        // top of useRegisterSW from "virtual:pwa-register/react".
        registerType: "autoUpdate",
        injectRegister: false,
        includeAssets: ["favicon.ico", "icon-source.svg", "apple-touch-icon-180x180.png"],
        manifest: {
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
        },
      }),
    ],
    resolve: {
      // Exact-match regex so e.g. `@moc/design-system/theme.css` falls
      // through to the package's exports map (string-form aliases prefix-
      // match and would resolve to `<src/index.ts>/theme.css`).
      alias: [
        {
          find: /^@moc\/contracts$/,
          replacement: path.resolve(__dirname, "../../libs/shared/contracts/src/index.ts"),
        },
        {
          find: /^@moc\/web-core$/,
          replacement: path.resolve(__dirname, "../../libs/web/core/src/index.ts"),
        },
        {
          find: /^@moc\/design-system$/,
          replacement: path.resolve(__dirname, "../../libs/web/design-system/src/index.ts"),
        },
      ],
    },
    server: {
      port: webPort,
      proxy: {
        "/api": apiTarget,
      },
    },
    test: {
      environment: "jsdom",
      globals: false,
      setupFiles: ["./test/setup.ts"],
    },
  };
});
