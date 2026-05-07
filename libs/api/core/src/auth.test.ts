import { describe, it, expect } from "vitest";
import { GoogleProfile } from "@moc/contracts";
import { newUserFromGoogleProfile } from "./auth.js";

describe("newUserFromGoogleProfile", () => {
  const profile = GoogleProfile.parse({
    sub: "117851234567890123456",
    email: "Alice@Example.com",
    email_verified: true,
    name: "Alice",
  });
  const deps = {
    newId: () => "550e8400-e29b-41d4-a716-446655440000",
    now: () => new Date("2026-05-07T00:00:00.000Z"),
  };

  it("projects a valid User", () => {
    const u = newUserFromGoogleProfile(profile, deps);
    expect(u).toEqual({
      id: "550e8400-e29b-41d4-a716-446655440000",
      email: "alice@example.com",
      googleId: "117851234567890123456",
      createdAt: "2026-05-07T00:00:00.000Z",
    });
  });

  it("is deterministic for the same input + deps", () => {
    const a = newUserFromGoogleProfile(profile, deps);
    const b = newUserFromGoogleProfile(profile, deps);
    expect(a).toEqual(b);
  });

  it("relies on the GoogleProfile schema to normalize email beforehand", () => {
    expect(profile.email).toBe("alice@example.com");
  });
});
