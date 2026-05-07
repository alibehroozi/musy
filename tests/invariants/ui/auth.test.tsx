// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-*.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
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

describe("UI-01: app shell gates the main view on /api/auth/me", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    cleanup();
  });
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it("renders an element with accessible name 'Sign in with Google' when /api/auth/me returns 401", async () => {
    mockMe(401, { error: { code: "unauthorized", message: "no session" } });
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeInTheDocument();
    });
  });

  it("renders the main shell (no sign-in button) when /api/auth/me returns 200", async () => {
    mockMe(200, VALID_USER);
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "musy" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Sign in with Google" })).toBeNull();
  });

  it("clicking 'Sign in with Google' navigates the browser to /api/auth/google", async () => {
    mockMe(401, { error: { code: "unauthorized", message: "no session" } });

    // jsdom doesn't allow assigning to window.location.href directly; spy on
    // the assignment via a property descriptor swap.
    const hrefSpy = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...originalLocation,
        set href(v: string) {
          hrefSpy(v);
        },
      },
    });

    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );
    const button = await screen.findByRole("button", { name: "Sign in with Google" });
    button.click();
    expect(hrefSpy).toHaveBeenCalledTimes(1);
    expect(hrefSpy.mock.calls[0]?.[0]).toMatch(/\/api\/auth\/google$/);

    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });
});
