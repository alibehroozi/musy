import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Used by Ladle for stories. Tailwind v4 reads tokens from
// src/styles/theme.css via the @theme directive.
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
