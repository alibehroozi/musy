import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// React Testing Library doesn't auto-cleanup with vitest by default — add it.
afterEach(() => {
  cleanup();
});
