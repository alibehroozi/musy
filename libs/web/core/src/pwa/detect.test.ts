import { describe, it, expect } from "vitest";
import { detectPwaPlatform, isInStandaloneMode } from "./detect.js";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.111 Mobile/15E148 Safari/604.1";
const IPAD_SAFARI =
  "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.111 Mobile Safari/537.36";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.111 Safari/537.36";
const DESKTOP_FIREFOX =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0";

describe("detectPwaPlatform", () => {
  it("identifies iOS Safari", () => {
    expect(detectPwaPlatform({ userAgent: IPHONE_SAFARI, isStandalone: false })).toBe("ios-safari");
    expect(detectPwaPlatform({ userAgent: IPAD_SAFARI, isStandalone: false })).toBe("ios-safari");
  });

  it("distinguishes iOS Chrome (can't install)", () => {
    expect(detectPwaPlatform({ userAgent: IPHONE_CHROME, isStandalone: false })).toBe(
      "ios-other-browser",
    );
  });

  it("identifies Android Chrome as installable", () => {
    expect(detectPwaPlatform({ userAgent: ANDROID_CHROME, isStandalone: false })).toBe(
      "android-installable",
    );
  });

  it("identifies desktop Chrome as installable", () => {
    expect(detectPwaPlatform({ userAgent: DESKTOP_CHROME, isStandalone: false })).toBe(
      "desktop-installable",
    );
  });

  it("returns 'unknown' for unrecognised UAs", () => {
    expect(detectPwaPlatform({ userAgent: DESKTOP_FIREFOX, isStandalone: false })).toBe("unknown");
    expect(detectPwaPlatform({ userAgent: "", isStandalone: false })).toBe("unknown");
  });

  it("returns 'installed' whenever isStandalone is true, regardless of UA", () => {
    expect(detectPwaPlatform({ userAgent: IPHONE_SAFARI, isStandalone: true })).toBe("installed");
    expect(detectPwaPlatform({ userAgent: ANDROID_CHROME, isStandalone: true })).toBe("installed");
    expect(detectPwaPlatform({ userAgent: DESKTOP_CHROME, isStandalone: true })).toBe("installed");
  });
});

describe("isInStandaloneMode", () => {
  it("returns true when matchMedia('(display-mode: standalone)').matches is true", () => {
    expect(
      isInStandaloneMode({
        matchMedia: (q) => ({ matches: q === "(display-mode: standalone)" }),
      }),
    ).toBe(true);
  });

  it("returns true when navigator.standalone is true (iOS Safari)", () => {
    expect(
      isInStandaloneMode({
        navigator: { standalone: true },
      }),
    ).toBe(true);
  });

  it("returns false when both inputs are false or absent", () => {
    expect(
      isInStandaloneMode({
        matchMedia: () => ({ matches: false }),
        navigator: { standalone: false },
      }),
    ).toBe(false);
    expect(isInStandaloneMode({})).toBe(false);
  });
});
