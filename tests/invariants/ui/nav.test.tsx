// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-02 and UI-03.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../../apps/web/src/contexts/AuthContext.js";
import { App } from "../../../apps/web/src/App.js";

function mockMeAnon(): void {
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ error: { code: "unauthorized", message: "no session" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
  ) as typeof globalThis.fetch;
}

function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("UI-02: bottom navigation visible on all routes regardless of auth state", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    cleanup();
    mockMeAnon();
  });
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  const ROUTES = ["/explore", "/taste", "/search", "/unknown-route"] as const;

  for (const route of ROUTES) {
    it(`renders bottom nav on ${route}`, async () => {
      renderApp(route);
      await waitFor(() => {
        expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
      });
    });
  }
});

describe("UI-03: exactly one nav tab carries aria-current='page' matching the active route", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    cleanup();
    mockMeAnon();
  });
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it("only the Explore tab is active on /explore", async () => {
    renderApp("/explore");
    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument(),
    );
    const links = screen.getAllByRole("link");
    const active = links.filter((l) => l.getAttribute("aria-current") === "page");
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveTextContent("Explore");
  });

  it("only the Taste tab is active on /taste", async () => {
    renderApp("/taste");
    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument(),
    );
    const links = screen.getAllByRole("link");
    const active = links.filter((l) => l.getAttribute("aria-current") === "page");
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveTextContent("Taste");
  });

  it("only the Search tab is active on /search", async () => {
    renderApp("/search");
    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument(),
    );
    const links = screen.getAllByRole("link");
    const active = links.filter((l) => l.getAttribute("aria-current") === "page");
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveTextContent("Search");
  });
});
