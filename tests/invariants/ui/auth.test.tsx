// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-*.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../../apps/web/src/contexts/AuthContext.js";
import { App } from "../../../apps/web/src/App.js";

const ME_URL_PATTERN = /\/api\/auth\/me$/;

const VALID_USER = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  email: "alice@example.com",
  googleId: "g_alice_117851234567890123456",
  createdAt: "2026-05-07T00:00:00.000Z",
};

function mockMe(status: number, body: unknown): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (ME_URL_PATTERN.test(url)) {
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("", { status: 404 });
  }) as typeof globalThis.fetch;
}

function renderApp(initialPath = "/search") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("UI-01: app shell renders routed bottom nav for all users regardless of auth state", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    cleanup();
  });
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it("renders the bottom navigation when /api/auth/me returns 401 (anonymous user)", async () => {
    mockMe(401, { error: { code: "unauthorized", message: "no session" } });
    renderApp();
    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Sign in with Google" })).toBeNull();
  });

  it("renders the bottom navigation when /api/auth/me returns 200 (authenticated user)", async () => {
    mockMe(200, VALID_USER);
    renderApp();
    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Sign in with Google" })).toBeNull();
  });
});
