// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-*.

import { describe, it, expect } from "vitest";
import { User, Email, UserId } from "@moc/contracts";
import { normalizeEmail } from "@moc/api-core";

describe("DATA-01: Every User document has a non-empty id (uuid v4) and unique, lowercase email", () => {
  it("a valid User parses cleanly", () => {
    const valid = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      email: "alice@example.com",
      googleId: "117851234567890123456",
      createdAt: new Date().toISOString(),
    };
    expect(() => User.parse(valid)).not.toThrow();
  });

  it("rejects empty id", () => {
    expect(() =>
      User.parse({
        id: "",
        email: "alice@example.com",
        createdAt: new Date().toISOString(),
      }),
    ).toThrow();
  });

  it("rejects non-uuid id", () => {
    expect(() =>
      User.parse({
        id: "not-a-uuid",
        email: "alice@example.com",
        createdAt: new Date().toISOString(),
      }),
    ).toThrow();
  });

  it("rejects invalid email", () => {
    expect(() =>
      User.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        email: "not-an-email",
        createdAt: new Date().toISOString(),
      }),
    ).toThrow();
  });

  it("normalizes email to lowercase at the boundary", () => {
    const normalized = normalizeEmail("  Alice@Example.COM  ");
    expect(normalized).toBe("alice@example.com");
  });

  it("Email schema lowercases on parse", () => {
    expect(Email.parse("Alice@Example.com")).toBe("alice@example.com");
  });

  it("UserId rejects non-uuid", () => {
    expect(() => UserId.parse("abc")).toThrow();
  });
});

describe("DATA-02: Every User document has a non-empty, unique googleId (the Google sub claim)", () => {
  it("a valid User with googleId parses cleanly", () => {
    const valid = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      email: "alice@example.com",
      googleId: "117851234567890123456",
      createdAt: new Date().toISOString(),
    };
    expect(() => User.parse(valid)).not.toThrow();
  });

  it("rejects User without googleId", () => {
    expect(() =>
      User.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        email: "alice@example.com",
        createdAt: new Date().toISOString(),
      }),
    ).toThrow();
  });

  it("rejects User with empty googleId", () => {
    expect(() =>
      User.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        email: "alice@example.com",
        googleId: "",
        createdAt: new Date().toISOString(),
      }),
    ).toThrow();
  });
});
