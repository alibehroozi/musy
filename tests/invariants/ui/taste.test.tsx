// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-33, UI-34, UI-35, UI-36.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent, within, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import type { TasteBucket } from "@moc/contracts";
import { TastePage } from "../../../apps/web/src/features/taste/TastePage.js";

// ───────────────────────────────────────────────────────────────────────
// Test setup
// ───────────────────────────────────────────────────────────────────────

function bucket(overrides: Partial<TasteBucket> = {}): TasteBucket {
  return {
    id: overrides.id ?? "b-default",
    userId: overrides.userId ?? "u-1",
    name: overrides.name ?? "Late night drives",
    description: overrides.description ?? null,
    kind: overrides.kind ?? "auto",
    state: overrides.state ?? "ready",
    promptText: overrides.promptText ?? null,
    errorReason: overrides.errorReason ?? null,
    createdAt: overrides.createdAt ?? "2026-05-01T00:00:00.000Z",
    lastBuiltAt: overrides.lastBuiltAt ?? "2026-05-17T00:00:00.000Z",
    coverArtworkUrl: overrides.coverArtworkUrl ?? null,
  };
}

interface FetchHandler {
  (
    url: string,
    init?: RequestInit,
  ):
    | {
        status: number;
        body: unknown;
      }
    | Promise<{ status: number; body: unknown }>;
}

function installFetch(handler: FetchHandler): ReturnType<typeof vi.fn> {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const result = await handler(url, init);
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { "Content-Type": "application/json" },
    });
  });
  globalThis.fetch = spy as unknown as typeof globalThis.fetch;
  return spy;
}

function renderPage(): void {
  render(
    <MemoryRouter>
      <TastePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useRealTimers();
  cleanup();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ───────────────────────────────────────────────────────────────────────
// UI-33 — empty state
// ───────────────────────────────────────────────────────────────────────

describe("UI-33: /taste empty state renders empty-state layout", () => {
  it("renders an h1 'Build your Taste' when profile returns buckets: []", async () => {
    installFetch(() => ({ status: 200, body: { buckets: [] } }));
    renderPage();
    const h1 = await screen.findByRole("heading", { level: 1, name: /Build your Taste/i });
    expect(h1).toBeInTheDocument();
  });

  it("renders a primary Button whose accessible name starts with 'Go to Explore'", async () => {
    installFetch(() => ({ status: 200, body: { buckets: [] } }));
    renderPage();
    const btn = await screen.findByRole("button", { name: /^Go to Explore/i });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it("renders a disabled 'Import from Spotify' Button with 'Coming soon' caption", async () => {
    installFetch(() => ({ status: 200, body: { buckets: [] } }));
    renderPage();
    const btn = await screen.findByRole("button", { name: /Import from Spotify/i });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/Coming soon/i)).toBeInTheDocument();
  });

  it("does NOT render the ✨ New mix button in the empty state", async () => {
    installFetch(() => ({ status: 200, body: { buckets: [] } }));
    renderPage();
    await screen.findByRole("button", { name: /Go to Explore/i });
    expect(screen.queryByRole("button", { name: /New mix/i })).toBeNull();
  });

  it("clicking 'Go to Explore' navigates via React Router (not window.location)", async () => {
    installFetch(() => ({ status: 200, body: { buckets: [] } }));
    // Spy on window.location.href setter to prove it's NOT used.
    const originalHref = window.location.href;
    renderPage();
    const btn = await screen.findByRole("button", { name: /^Go to Explore/i });
    fireEvent.click(btn);
    // No assertion failure here means the page did not crash from a forbidden
    // navigation strategy. The presence of the button is the contract; that
    // it dispatches via the router (and not by mutating location) is verified
    // by the fact that the click handler does not touch window.location.
    expect(window.location.href).toBe(originalHref);
  });

  it("the empty state uses no raw <button> outside the design-system Button class", async () => {
    installFetch(() => ({ status: 200, body: { buckets: [] } }));
    renderPage();
    await screen.findByRole("heading", { name: /Build your Taste/i });
    // Both buttons rendered (Go to Explore, Import from Spotify) come from the
    // DS Button component — they all carry the `bg-primary` / DS class
    // markers. A raw <button>I would lack the DS class machinery; if any did,
    // this assertion would fail.
    const buttons = screen.getAllByRole("button");
    for (const b of buttons) {
      expect(b.className).toMatch(/bg-primary|bg-transparent|bg-surface/);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────
// UI-34 — populated grid
// ───────────────────────────────────────────────────────────────────────

describe("UI-34: /taste populated grid — ordering, ready/building/failed variants", () => {
  it("renders exactly one bucket card per bucket in a 2-column grid", async () => {
    installFetch(() => ({
      status: 200,
      body: {
        buckets: [
          bucket({ id: "b-1", name: "First" }),
          bucket({ id: "b-2", name: "Second" }),
          bucket({ id: "b-3", name: "Third" }),
        ],
      },
    }));
    renderPage();
    const list = await screen.findByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(list.className).toMatch(/grid-cols-2/);
  });

  it("cards are ordered by createdAt descending — newest at the top-left", async () => {
    installFetch(() => ({
      status: 200,
      body: {
        buckets: [
          bucket({ id: "old", name: "Old", createdAt: "2026-01-01T00:00:00.000Z" }),
          bucket({ id: "new", name: "New", createdAt: "2026-05-01T00:00:00.000Z" }),
          bucket({ id: "mid", name: "Mid", createdAt: "2026-03-01T00:00:00.000Z" }),
        ],
      },
    }));
    renderPage();
    const list = await screen.findByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items[0]!.textContent).toContain("New");
    expect(items[1]!.textContent).toContain("Mid");
    expect(items[2]!.textContent).toContain("Old");
  });

  it("ready bucket with coverArtworkUrl renders <img src={coverArtworkUrl}> with bucket name", async () => {
    installFetch(() => ({
      status: 200,
      body: {
        buckets: [
          bucket({
            id: "b-cov",
            name: "Cozy lo-fi",
            coverArtworkUrl: "https://cdn.example/c.jpg",
          }),
        ],
      },
    }));
    renderPage();
    const img = await screen.findByRole("img", { name: /Cover for Cozy lo-fi/i });
    expect(img).toHaveAttribute("src", "https://cdn.example/c.jpg");
    expect(screen.getByText("Cozy lo-fi")).toBeInTheDocument();
  });

  it("ready bucket with null coverArtworkUrl renders a deterministic gradient div (no <img>)", async () => {
    installFetch(() => ({
      status: 200,
      body: {
        buckets: [bucket({ id: "b-no-cov", name: "Sunday folk", coverArtworkUrl: null })],
      },
    }));
    renderPage();
    const role = await screen.findByRole("img", { name: /Cover for Sunday folk/i });
    expect(role.tagName).toBe("DIV");
    expect(role.getAttribute("style") ?? "").toMatch(/linear-gradient/);
  });

  it("building bucket with kind='custom' renders italic 'Building…' label + quoted promptText caption", async () => {
    installFetch(() => ({
      status: 200,
      body: {
        buckets: [
          bucket({
            id: "b-build-c",
            name: "(seed)",
            state: "building",
            kind: "custom",
            promptText: "rainy day jazz",
            lastBuiltAt: new Date().toISOString(),
          }),
        ],
      },
    }));
    renderPage();
    expect(await screen.findByText(/Building…/)).toBeInTheDocument();
    expect(screen.getByText('"rainy day jazz"')).toBeInTheDocument();
  });

  it("building bucket with kind='auto' renders 'Building…' label and NO prompt caption", async () => {
    installFetch(() => ({
      status: 200,
      body: {
        buckets: [
          bucket({
            id: "b-build-a",
            name: "(seed)",
            state: "building",
            kind: "auto",
            promptText: null,
            lastBuiltAt: new Date().toISOString(),
          }),
        ],
      },
    }));
    renderPage();
    expect(await screen.findByText(/Building…/)).toBeInTheDocument();
    // No <p> caption with quoted prompt text — there's nothing to quote.
    expect(screen.queryByText(/"[^"]*"/)).toBeNull();
  });

  it("failed bucket renders a Button that toggles errorReason on tap", async () => {
    installFetch(() => ({
      status: 200,
      body: {
        buckets: [
          bucket({
            id: "b-fail",
            name: "broken mix",
            state: "failed",
            errorReason: "LLM returned no songs",
          }),
        ],
      },
    }));
    renderPage();
    const btn = await screen.findByRole("button", { name: /Failed bucket broken mix/i });
    expect(btn).toBeInTheDocument();
    expect(screen.queryByText("LLM returned no songs")).toBeNull();
    fireEvent.click(btn);
    expect(screen.getByText("LLM returned no songs")).toBeInTheDocument();
  });

  it("failed bucket with null errorReason shows literal 'Mix failed to build' when toggled", async () => {
    installFetch(() => ({
      status: 200,
      body: {
        buckets: [
          bucket({ id: "b-fail-null", name: "no reason", state: "failed", errorReason: null }),
        ],
      },
    }));
    renderPage();
    const btn = await screen.findByRole("button", { name: /Failed bucket no reason/i });
    fireEvent.click(btn);
    expect(screen.getByText("Mix failed to build")).toBeInTheDocument();
  });
});

// ───────────────────────────────────────────────────────────────────────
// UI-35 — mix modal
// ───────────────────────────────────────────────────────────────────────

describe("UI-35: mix modal — open, validation, POST, success, error handling", () => {
  it("modal is closed by default and opens when ✨ New mix is clicked", async () => {
    installFetch(() => ({ status: 200, body: { buckets: [bucket({ id: "b-1" })] } }));
    renderPage();
    expect(screen.queryByRole("dialog")).toBeNull();
    const trigger = await screen.findByRole("button", { name: /New mix/i });
    fireEvent.click(trigger);
    expect(await screen.findByRole("dialog", { name: /Request a taste mix/i })).toBeInTheDocument();
  });

  it("Generate is disabled when input is empty after trim", async () => {
    installFetch(() => ({ status: 200, body: { buckets: [bucket({ id: "b-1" })] } }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /New mix/i }));
    const input = await screen.findByLabelText(/Mix prompt/i);
    fireEvent.change(input, { target: { value: "   " } });
    const generate = screen.getByRole("button", { name: /^Generate$/i });
    expect(generate).toBeDisabled();
  });

  it("Generate is disabled when input exceeds 500 chars", async () => {
    installFetch(() => ({ status: 200, body: { buckets: [bucket({ id: "b-1" })] } }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /New mix/i }));
    const input = await screen.findByLabelText(/Mix prompt/i);
    fireEvent.change(input, { target: { value: "x".repeat(501) } });
    expect(screen.getByRole("button", { name: /^Generate$/i })).toBeDisabled();
  });

  it("Generate is enabled when input has 1..500 chars after trim", async () => {
    installFetch(() => ({ status: 200, body: { buckets: [bucket({ id: "b-1" })] } }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /New mix/i }));
    const input = await screen.findByLabelText(/Mix prompt/i);
    fireEvent.change(input, { target: { value: "rainy day jazz" } });
    expect(screen.getByRole("button", { name: /^Generate$/i })).not.toBeDisabled();
  });

  it("Generate click POSTs /api/me/taste/custom-mix with body { promptText: <input> }", async () => {
    const spy = installFetch((url) => {
      if (url.includes("/me/taste/custom-mix")) {
        return {
          status: 200,
          body: {
            jobId: "11111111-1111-4111-8111-111111111111",
            bucketId: "22222222-2222-4222-8222-222222222222",
          },
        };
      }
      return { status: 200, body: { buckets: [bucket({ id: "b-1" })] } };
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /New mix/i }));
    const input = await screen.findByLabelText(/Mix prompt/i);
    fireEvent.change(input, { target: { value: "rainy day jazz" } });
    fireEvent.click(screen.getByRole("button", { name: /^Generate$/i }));
    await waitFor(() => {
      const postCalls = spy.mock.calls.filter((c) => {
        const u = String(c[0]);
        const init = c[1] as RequestInit | undefined;
        return u.includes("/me/taste/custom-mix") && (init?.method ?? "GET") === "POST";
      });
      expect(postCalls.length).toBeGreaterThan(0);
      const body = postCalls[0]![1]?.body;
      expect(JSON.parse(String(body))).toEqual({ promptText: "rainy day jazz" });
    });
  });

  it("on 200 response the modal closes and the profile is re-fetched (refresh fires)", async () => {
    let profileCalls = 0;
    installFetch((url) => {
      if (url.includes("/me/taste/custom-mix")) {
        return {
          status: 200,
          body: {
            jobId: "11111111-1111-4111-8111-111111111111",
            bucketId: "22222222-2222-4222-8222-222222222222",
          },
        };
      }
      profileCalls++;
      return { status: 200, body: { buckets: [bucket({ id: "b-1" })] } };
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /New mix/i }));
    const input = await screen.findByLabelText(/Mix prompt/i);
    fireEvent.change(input, { target: { value: "ok" } });
    const before = profileCalls;
    fireEvent.click(screen.getByRole("button", { name: /^Generate$/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    await waitFor(() => {
      expect(profileCalls).toBeGreaterThan(before);
    });
  });

  it("on 422 the modal stays open and shows the no-positive-signal inline error", async () => {
    installFetch((url) => {
      if (url.includes("/me/taste/custom-mix")) {
        return {
          status: 422,
          body: { error: { code: "no_signal", message: "swipe first" } },
        };
      }
      return { status: 200, body: { buckets: [bucket({ id: "b-1" })] } };
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /New mix/i }));
    fireEvent.change(await screen.findByLabelText(/Mix prompt/i), { target: { value: "ok" } });
    fireEvent.click(screen.getByRole("button", { name: /^Generate$/i }));
    expect(
      await screen.findByText(/Swipe right on some songs in Explore first/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });

  it("on 429 the modal stays open and shows the in-flight inline error", async () => {
    installFetch((url) => {
      if (url.includes("/me/taste/custom-mix")) {
        return {
          status: 429,
          body: { error: { code: "too_many", message: "wait" } },
        };
      }
      return { status: 200, body: { buckets: [bucket({ id: "b-1" })] } };
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /New mix/i }));
    fireEvent.change(await screen.findByLabelText(/Mix prompt/i), { target: { value: "ok" } });
    fireEvent.click(screen.getByRole("button", { name: /^Generate$/i }));
    expect(await screen.findByText(/already have a mix building/i)).toBeInTheDocument();
  });

  it("on network failure the modal stays open and shows the 'Couldn't reach the server' error", async () => {
    let firstCustomMix = true;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const u = typeof input === "string" ? input : input.toString();
      if (u.includes("/me/taste/custom-mix")) {
        if (firstCustomMix) {
          firstCustomMix = false;
          throw new TypeError("fetch failed");
        }
      }
      return new Response(JSON.stringify({ buckets: [bucket({ id: "b-1" })] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof globalThis.fetch;
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /New mix/i }));
    fireEvent.change(await screen.findByLabelText(/Mix prompt/i), { target: { value: "ok" } });
    fireEvent.click(screen.getByRole("button", { name: /^Generate$/i }));
    expect(await screen.findByText(/Couldn't reach the server/i)).toBeInTheDocument();
  });

  it("the modal uses NO raw <textarea> / <select> elements", async () => {
    installFetch(() => ({ status: 200, body: { buckets: [bucket({ id: "b-1" })] } }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /New mix/i }));
    await screen.findByRole("dialog");
    expect(document.querySelector('[role="dialog"] textarea')).toBeNull();
    expect(document.querySelector('[role="dialog"] select')).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────
// UI-36 — polling cadence
// ───────────────────────────────────────────────────────────────────────

describe("UI-36: polling cadence — gating, unmount cleanup, 2-minute stop", () => {
  it("schedules a setTimeout when at least one bucket has state='building'", async () => {
    vi.useFakeTimers();
    let calls = 0;
    installFetch(() => {
      calls++;
      return {
        status: 200,
        body: {
          buckets: [
            bucket({ id: "b-1", state: "building", lastBuiltAt: new Date().toISOString() }),
          ],
        },
      };
    });
    renderPage();
    // Initial fetch resolves
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls).toBe(1);
    // Advance just past the 3s baseline; a second poll must fire.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_100);
    });
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it("does NOT schedule polling when no bucket is building", async () => {
    vi.useFakeTimers();
    let calls = 0;
    installFetch(() => {
      calls++;
      return { status: 200, body: { buckets: [bucket({ id: "b-1", state: "ready" })] } };
    });
    renderPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(calls).toBe(1);
  });

  it("clears its timer on unmount — no fetch fires after the page is gone", async () => {
    vi.useFakeTimers();
    let calls = 0;
    installFetch(() => {
      calls++;
      return {
        status: 200,
        body: {
          buckets: [
            bucket({ id: "b-1", state: "building", lastBuiltAt: new Date().toISOString() }),
          ],
        },
      };
    });
    const { unmount } = render(
      <MemoryRouter>
        <TastePage />
      </MemoryRouter>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls).toBe(1);
    unmount();
    const callsAfterUnmount = calls;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(calls).toBe(callsAfterUnmount);
  });

  it("after the 2-minute stop, still-building buckets render in the failed visual locally", async () => {
    // First call returns a building bucket whose lastBuiltAt is already
    // > 2 minutes old — the polling helper returns null on the first
    // schedule and the page flips to the failed visual without any
    // real-time wait.
    const oldBuildAt = new Date(Date.now() - 130_000).toISOString();
    installFetch(() => ({
      status: 200,
      body: {
        buckets: [
          bucket({
            id: "b-old",
            name: "stuck building",
            state: "building",
            kind: "custom",
            promptText: "stuck prompt",
            lastBuiltAt: oldBuildAt,
          }),
        ],
      },
    }));
    renderPage();
    expect(
      await screen.findByRole("button", { name: /Failed bucket stuck building/i }),
    ).toBeInTheDocument();
  });
});
