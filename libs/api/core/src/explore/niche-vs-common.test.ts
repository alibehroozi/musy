import { describe, it, expect } from "vitest";
import { classifyByListenCount, NICHE_THRESHOLD, COMMON_THRESHOLD } from "./niche-vs-common.js";

describe("classifyByListenCount", () => {
  it("null → 'niche' (default-pessimistic — unknown popularity is treated as obscure)", () => {
    expect(classifyByListenCount(null)).toBe("niche");
    expect(classifyByListenCount(undefined)).toBe("niche");
  });

  it("counts below NICHE_THRESHOLD → 'niche'", () => {
    expect(classifyByListenCount(0)).toBe("niche");
    expect(classifyByListenCount(NICHE_THRESHOLD - 1)).toBe("niche");
  });

  it("counts in [NICHE_THRESHOLD, COMMON_THRESHOLD) → 'mid'", () => {
    expect(classifyByListenCount(NICHE_THRESHOLD)).toBe("mid");
    expect(classifyByListenCount(COMMON_THRESHOLD - 1)).toBe("mid");
  });

  it("counts at or above COMMON_THRESHOLD → 'common'", () => {
    expect(classifyByListenCount(COMMON_THRESHOLD)).toBe("common");
    expect(classifyByListenCount(COMMON_THRESHOLD * 10)).toBe("common");
  });

  it("non-finite or negative → 'niche'", () => {
    expect(classifyByListenCount(NaN)).toBe("niche");
    expect(classifyByListenCount(Infinity)).toBe("niche");
    expect(classifyByListenCount(-1)).toBe("niche");
  });
});
