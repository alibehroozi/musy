import { describe, it, expect } from "vitest";
import { applyInterestEvent } from "./interestEvent.js";

describe("applyInterestEvent — max-rule", () => {
  it("explored on a new document sets score to 3", () => {
    const { score, scoreChanged } = applyInterestEvent(null, "explored");
    expect(score).toBe(3);
    expect(scoreChanged).toBe(true);
  });

  it("saved on a new document sets score to 8", () => {
    const { score, scoreChanged } = applyInterestEvent(null, "saved");
    expect(score).toBe(8);
    expect(scoreChanged).toBe(true);
  });

  it("explored after explored keeps score at 3 (no change)", () => {
    const { score, scoreChanged } = applyInterestEvent(3, "explored");
    expect(score).toBe(3);
    expect(scoreChanged).toBe(false);
  });

  it("saved after explored raises score from 3 to 8", () => {
    const { score, scoreChanged } = applyInterestEvent(3, "saved");
    expect(score).toBe(8);
    expect(scoreChanged).toBe(true);
  });

  it("explored after saved keeps score at 8 (max-rule, no decrease)", () => {
    const { score, scoreChanged } = applyInterestEvent(8, "explored");
    expect(score).toBe(8);
    expect(scoreChanged).toBe(false);
  });

  it("saved after saved keeps score at 8 (idempotent)", () => {
    const { score, scoreChanged } = applyInterestEvent(8, "saved");
    expect(score).toBe(8);
    expect(scoreChanged).toBe(false);
  });
});
