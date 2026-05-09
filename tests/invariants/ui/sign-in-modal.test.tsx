// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-09, UI-10.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import {
  AuthContext,
  type AuthContextValue,
  type AuthState,
} from "../../../apps/web/src/contexts/AuthContext.js";
import { ResultsList } from "../../../apps/web/src/features/search/components/ResultsList.js";
import type { SearchResponse } from "@moc/contracts";

const SAMPLE: SearchResponse = {
  results: [
    {
      type: "track",
      id: "deezer:1",
      title: "Get Lucky",
      artist: "Daft Punk",
      provider: "deezer",
      providerId: "1",
      sources: ["deezer"],
    },
  ],
  partial: false,
  failedProviders: [],
  cached: false,
};

function renderResultsList(authState: AuthState): void {
  const ctx: AuthContextValue = { state: authState, refresh: async () => {} };
  render(
    <AuthContext.Provider value={ctx}>
      <MemoryRouter>
        <ResultsList data={SAMPLE} />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("UI-09: anonymous tap on a result row OR add button opens the sign-in Modal and fires no event POST", () => {
  const originalFetch = globalThis.fetch;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cleanup();
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
  });
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it("tapping a row when unauthenticated opens the sign-in Modal", () => {
    renderResultsList({ status: "unauthenticated", error: null });
    fireEvent.click(screen.getByTestId("interactive-row"));
    expect(screen.getByRole("dialog", { name: /sign in/i })).toBeInTheDocument();
  });

  it("tapping the add (save) button when unauthenticated opens the sign-in Modal", () => {
    renderResultsList({ status: "unauthenticated", error: null });
    fireEvent.click(screen.getByTestId("save-button"));
    expect(screen.getByRole("dialog", { name: /sign in/i })).toBeInTheDocument();
  });

  it("no POST /api/search/explored is fired when an anonymous user taps a row", () => {
    renderResultsList({ status: "unauthenticated", error: null });
    fireEvent.click(screen.getByTestId("interactive-row"));
    const calls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.find((u) => u.includes("/search/explored"))).toBeUndefined();
  });

  it("no POST /api/search/saved is fired when an anonymous user taps the add button", () => {
    renderResultsList({ status: "unauthenticated", error: null });
    fireEvent.click(screen.getByTestId("save-button"));
    const calls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.find((u) => u.includes("/search/saved"))).toBeUndefined();
  });
});

describe("UI-10: sign-in Modal sits at z-index --z-modal so it renders above the bottom navigation", () => {
  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  it("the Modal backdrop carries the z-modal CSS variable as its z-index", () => {
    renderResultsList({ status: "unauthenticated", error: null });
    fireEvent.click(screen.getByTestId("interactive-row"));
    const backdrop = screen.getByTestId("modal-backdrop");
    expect(backdrop.style.zIndex).toBe("var(--z-modal)");
  });

  it("the Modal renders into document.body so it escapes any container with stacking context", () => {
    renderResultsList({ status: "unauthenticated", error: null });
    fireEvent.click(screen.getByTestId("save-button"));
    const backdrop = screen.getByTestId("modal-backdrop");
    expect(backdrop.parentElement).toBe(document.body);
  });
});
