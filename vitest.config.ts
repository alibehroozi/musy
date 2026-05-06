import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@moc/contracts": path.resolve(__dirname, "libs/shared/contracts/src/index.ts"),
      "@moc/api-core": path.resolve(__dirname, "libs/api/core/src/index.ts"),
      "@moc/web-core": path.resolve(__dirname, "libs/web/core/src/index.ts"),
    },
  },
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts", "libs/**/*.test.ts", "apps/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "apps/api/test/e2e/**"],
  },
});
