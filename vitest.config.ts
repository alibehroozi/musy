import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@moc/contracts": path.resolve(__dirname, "libs/shared/contracts/src/index.ts"),
      "@moc/api-core": path.resolve(__dirname, "libs/api/core/src/index.ts"),
      "@moc/web-core": path.resolve(__dirname, "libs/web/core/src/index.ts"),
      "@moc/design-system": path.resolve(__dirname, "libs/web/design-system/src/index.ts"),
      // vite-plugin-pwa's virtual:* module only resolves inside Vite.
      // The stub keeps anything transitively importing App.tsx
      // loadable under vitest's resolver. See file header for details.
      "virtual:pwa-register/react": path.resolve(
        __dirname,
        "tests/invariants/_helpers/virtual-pwa-register-react.ts",
      ),
    },
  },
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}", "libs/**/*.test.{ts,tsx}", "apps/**/*.test.{ts,tsx}"],
    // libs/web/design-system has its own vitest config (jsdom env + RTL setup).
    // The root run delegates to it via `npm run test:ds`.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "apps/api/test/e2e/**",
      "libs/web/design-system/**",
    ],
  },
});
