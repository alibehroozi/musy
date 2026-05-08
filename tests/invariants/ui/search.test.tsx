// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-04, UI-05, UI-06.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { SearchPage } from "../../../apps/web/src/features/search/SearchPage.js";

const EMPTY_RESPONSE = {
  results: [],
  partial: false,
  failedProviders: [],
  cached: false,
};

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
    {
      type: "track",
      id: "track:2",
      title: "One More Time",
      artist: "Daft Punk",
      provider: "audius",
      providerId: "audius-2",
      sources: ["audius"],
    },
  ],
  partial: false,
  failedProviders: [],
  cached: false,
};

const STATION_RESPONSE = {
  results: [
    {
      type: "station",
      id: "station:1",
      name: "BBC Radio 1",
      country: "GB",
      provider: "radio-browser",
      providerId: "rb-1",
      sources: ["radio-browser"],
    },
  ],
  partial: false,
  failedProviders: [],
  cached: false,
};

function mockSearchWith(response: unknown, delay = 0): void {
  globalThis.fetch = vi.fn(
    () =>
      new Promise((resolve) =>
        setTimeout(
          () =>
            resolve(
              new Response(JSON.stringify(response), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              }),
            ),
          delay,
        ),
      ),
  ) as typeof globalThis.fetch;
}

function renderSearchPage() {
  return render(
    <MemoryRouter>
      <SearchPage />
    </MemoryRouter>,
  );
}

function submitQuery(query: string) {
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: query } });
  fireEvent.keyDown(input, { key: "Enter" });
}

describe("UI-04: suggestions block visible when search input is empty and no history", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    cleanup();
    mockSearchWith(EMPTY_RESPONSE);
  });
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it("renders the suggestions block when the input is empty on initial load", () => {
    renderSearchPage();
    expect(screen.getByTestId("suggestions-block")).toBeInTheDocument();
  });

  it("suggestions block disappears once a search is submitted", async () => {
    mockSearchWith(EMPTY_RESPONSE, 0);
    renderSearchPage();
    expect(screen.getByTestId("suggestions-block")).toBeInTheDocument();
    submitQuery("daft punk");
    await waitFor(() => {
      expect(screen.queryByTestId("suggestions-block")).not.toBeInTheDocument();
    });
  });

  it("suggestions block returns after the input is cleared", async () => {
    mockSearchWith(EMPTY_RESPONSE, 0);
    renderSearchPage();
    submitQuery("daft punk");
    await waitFor(() => {
      expect(screen.queryByTestId("suggestions-block")).not.toBeInTheDocument();
    });
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByTestId("suggestions-block")).toBeInTheDocument();
  });
});

describe("UI-05: skeleton loading indicator visible while search is in flight", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    cleanup();
  });
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it("shows skeleton immediately after submitting a query, before the response arrives", async () => {
    // Use a long delay so skeleton is visible during the test.
    mockSearchWith(EMPTY_RESPONSE, 500);
    renderSearchPage();
    submitQuery("daft punk");
    // Skeleton should be visible right after submit (loading state).
    expect(screen.getByTestId("results-skeleton")).toBeInTheDocument();
    // Suggestions should no longer be shown.
    expect(screen.queryByTestId("suggestions-block")).not.toBeInTheDocument();
  });

  it("skeleton is replaced by results once the response arrives", async () => {
    mockSearchWith(TRACK_RESPONSE, 0);
    renderSearchPage();
    submitQuery("daft punk");
    await waitFor(() => {
      expect(screen.queryByTestId("results-skeleton")).not.toBeInTheDocument();
      expect(screen.getByTestId("results-list")).toBeInTheDocument();
    });
  });
});

describe("UI-06: every result in a successful response is rendered as a ResultRow", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    cleanup();
  });
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it("renders one row per track in the response", async () => {
    mockSearchWith(TRACK_RESPONSE, 0);
    renderSearchPage();
    submitQuery("daft punk");
    await waitFor(() => {
      expect(screen.getByTestId("results-list")).toBeInTheDocument();
    });
    expect(screen.getByText("Get Lucky")).toBeInTheDocument();
    expect(screen.getByText("One More Time")).toBeInTheDocument();
  });

  it("track rows include the artist name", async () => {
    mockSearchWith(TRACK_RESPONSE, 0);
    renderSearchPage();
    submitQuery("daft punk");
    await waitFor(() => {
      expect(screen.getByTestId("results-list")).toBeInTheDocument();
    });
    const artistNodes = screen.getAllByText(/Daft Punk/);
    expect(artistNodes.length).toBeGreaterThan(0);
  });

  it("station rows include a live indicator", async () => {
    mockSearchWith(STATION_RESPONSE, 0);
    renderSearchPage();
    submitQuery("bbc");
    await waitFor(() => {
      expect(screen.getByTestId("results-list")).toBeInTheDocument();
    });
    expect(screen.getByTestId("live-indicator")).toBeInTheDocument();
  });
});
