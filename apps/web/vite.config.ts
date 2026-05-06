import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico"],
      manifest: {
        name: "moc",
        short_name: "moc",
        description: "Music app with AI-powered taste processing",
        theme_color: "#0f0f10",
        background_color: "#0f0f10",
        display: "standalone",
        start_url: "/",
        icons: [],
      },
    }),
  ],
  resolve: {
    alias: {
      "@moc/contracts": path.resolve(__dirname, "../../libs/shared/contracts/src/index.ts"),
      "@moc/web-core": path.resolve(__dirname, "../../libs/web/core/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./test/setup.ts"],
  },
});
