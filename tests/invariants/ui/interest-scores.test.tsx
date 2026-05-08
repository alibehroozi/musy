// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-08, UI-09.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { SearchPage } from "../../../apps/web/src/features/search/SearchPage.js";
import {
  AuthContext,
  type AuthContextValue,
  type AuthState,
} from "../../../apps/web/src/contexts/AuthContext.js";

const TRACK_RESPONSE = {
  results: [
    {
      type: "track",
      id: "track:1",
      title: "Get Lucky",
      artist: "Daft Punk",
      provider: "deezer",
      providerId: "deezer-1",
      sources: ["deezer"],
    },
  ],
  partial: false,
  failedProviders: [],
  cached: false,
};

function mockSearch(response: unknown): void {
  globalThis.fetch = vi.fn(
    () =>
      new Promise((resolve) =>
        resolve(
          new Response(JSON.stringify(response), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
  ) as typeof globalThis.fetch;
}

function renderSearchPage(authState: AuthState = { status: "unauthenticated", error: null }) {
  const contextValue: AuthContextValue = { state: authState, refresh: async () => {} };
  return render(
    <AuthContext.Provider value={contextValue}>
      <MemoryRouter>
        <SearchPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

async function submitAndWaitForResults() {
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "daft punk" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(screen.getByTestId("results-list")).toBeInTheDocument());
}

describe("UI-08: anonymous user tap on row or add button opens sign-in Modal; no event POST fired", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    cleanup();
    mockSearch(TRACK_RESPONSE);
  });
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it("tapping a result row as anonymous opens the sign-in modal", async () => {
    renderSearchPage({ status: "unauthenticated", error: null });
    await submitAndWaitForResults();

    const row = screen.getByRole("button", { name: /daft punk|get lucky/i });
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByTestId("sign-in-modal")).toBeInTheDocument();
    });
  });

  it("tapping the add button as anonymous opens the sign-in modal", async () => {
    renderSearchPage({ status: "unauthenticated", error: null });
    await submitAndWaitForResults();

    const saveBtn = screen.getByRole("button", { name: "Save" });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByTestId("sign-in-modal")).toBeInTheDocument();
    });
  });

  it("no POST to /search/explored or /search/saved is made when user is anonymous", async () => {
    const fetchSpy = vi.fn(
      (input: RequestInfo | URL) =>
        new Promise<Response>((resolve) => {
          const url =
            typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
          resolve(
            new Response(JSON.stringify(TRACK_RESPONSE), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
          void url;
        }),
    ) as typeof globalThis.fetch;
    globalThis.fetch = fetchSpy;

    renderSearchPage({ status: "unauthenticated", error: null });
    await submitAndWaitForResults();

    const row = screen.getByRole("button", { name: /daft punk|get lucky/i });
    fireEvent.click(row);

    // Wait a tick for any async fire-and-forget calls
    await new Promise((r) => setTimeout(r, 50));

    const interestCalls = fetchSpy.mock.calls.filter((args) => {
      const url =
        typeof args[0] === "string"
          ? args[0]
          : args[0] instanceof URL
            ? args[0].href
            : (args[0] as Request).url;
      return url.includes("/search/explored") || url.includes("/search/saved");
    });
    expect(interestCalls).toHaveLength(0);
  });
});

describe("UI-09: sign-in Modal is rendered with z-modal styling above the bottom navigation", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    cleanup();
    mockSearch(TRACK_RESPONSE);
  });
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it("sign-in modal element has z-modal class applied", async () => {
    renderSearchPage({ status: "unauthenticated", error: null });
    await submitAndWaitForResults();

    const row = screen.getByRole("button", { name: /daft punk|get lucky/i });
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByTestId("sign-in-modal")).toBeInTheDocument();
    });

    // The Modal wrapper element carries z-modal
    const wrapper = screen.getByRole("presentation");
    expect(wrapper.className).toContain("z-modal");
  });
});
