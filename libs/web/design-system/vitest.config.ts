import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
    globals: false,
    include: ["src/**/*.test.tsx", "src/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
});
