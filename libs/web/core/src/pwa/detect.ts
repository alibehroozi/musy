/**
 * Pure platform-detection helpers for PWA install / update behavior.
 *
 * Lives in `libs/web/core/` because every input is passed in — no
 * `window`, `navigator`, or `document` access at module scope. Apps
 * read the live values and feed them in; this keeps the logic
 * testable headlessly with vitest.
 */

const IOS_UA_PATTERN = /\b(iPhone|iPad|iPod)\b/i;
const IOS_SAFARI_HINT = /Version\/[\d.]+ Safari/i;
const IOS_CHROME_HINT = /\bCriOS\b/i;
const IOS_FIREFOX_HINT = /\bFxiOS\b/i;
const IOS_EDGE_HINT = /\bEdgiOS\b/i;

export interface PwaPlatformInputs {
  /** `navigator.userAgent`. */
  userAgent: string;
  /**
   * `window.matchMedia("(display-mode: standalone)").matches`. iOS-style
   * `navigator.standalone` is folded in by the caller before passing.
   */
  isStandalone: boolean;
}

export type PwaPlatform =
  | "android-installable" // Chrome / Edge / Brave on Android — beforeinstallprompt fires
  | "ios-safari" // iOS Safari — no beforeinstallprompt; share → Add to Home Screen
  | "ios-other-browser" // iOS Chrome/Firefox/Edge — can't install from inside the browser
  | "desktop-installable" // Desktop Chrome / Edge — beforeinstallprompt fires
  | "installed" // running in standalone mode already
  | "unknown"; // unrecognised env (older browser, jsdom, server-render)

export function detectPwaPlatform({ userAgent, isStandalone }: PwaPlatformInputs): PwaPlatform {
  if (isStandalone) return "installed";

  if (IOS_UA_PATTERN.test(userAgent)) {
    if (
      IOS_CHROME_HINT.test(userAgent) ||
      IOS_FIREFOX_HINT.test(userAgent) ||
      IOS_EDGE_HINT.test(userAgent)
    ) {
      return "ios-other-browser";
    }
    if (IOS_SAFARI_HINT.test(userAgent)) {
      return "ios-safari";
    }
    // Generic iOS WebKit (e.g. WKWebView) — treat like Safari for the install hint
    return "ios-safari";
  }

  if (/Android/i.test(userAgent)) {
    return "android-installable";
  }

  if (/(Chrome|Edg|Brave)\//.test(userAgent)) {
    return "desktop-installable";
  }

  return "unknown";
}

/**
 * Live-read the current display mode + iOS's bespoke
 * `navigator.standalone` and collapse them into a single boolean.
 *
 * Lives next to `detectPwaPlatform` for convenience but accepts the
 * `window` it reads — keeps the lib's "no module-scope globals" rule.
 * Returns `false` when the inputs aren't present (jsdom, SSR).
 */
export function isInStandaloneMode(win: {
  matchMedia?: (q: string) => { matches: boolean };
  navigator?: { standalone?: boolean };
}): boolean {
  const mediaStandalone = win.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
  const iosStandalone = win.navigator?.standalone === true;
  return mediaStandalone || iosStandalone;
}
