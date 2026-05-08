// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-04, UI-05, UI-06.

import { describe, it } from "vitest";

describe("UI-04: suggestions block visible when search input is empty and no history", () => {
  it.todo("renders suggestions block with example queries when input is empty");
  it.todo("suggestions block disappears after a search is submitted");
});

describe("UI-05: skeleton loading indicator visible while search request is in flight", () => {
  it.todo("shows skeleton when a search is submitted and response is pending");
  it.todo("skeleton replaces the suggestions block, not shown alongside it");
});

describe("UI-06: every result in a successful response is rendered as a ResultRow", () => {
  it.todo("renders one row per result returned by the API");
  it.todo("track rows include the artist name");
  it.todo("station rows include a live indicator");
});
