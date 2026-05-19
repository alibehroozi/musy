import { usePwaUpdate } from "./hooks/usePwaUpdate.js";
import { usePwaInstall } from "./hooks/usePwaInstall.js";
import { UpdateAvailableBanner } from "./components/UpdateAvailableBanner.js";
import { InstallPromptBanner } from "./components/InstallPromptBanner.js";
import { IosInstallHint } from "./components/IosInstallHint.js";
import { isInStandaloneMode } from "@moc/web-core";

/**
 * Top-level PWA UX controller. Mounted once near the root (App.tsx)
 * so the install + update flows are reachable from every route.
 *
 * The update banner takes precedence over the install banner — there's
 * no realistic case where both are visible at once (you can't have an
 * update available without already running the app, and you can't be
 * about to install while running standalone), but if it did happen the
 * update is the time-critical signal.
 */
export function PwaController(): JSX.Element | null {
  const update = usePwaUpdate();

  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isStandalone = typeof window !== "undefined" ? isInStandaloneMode(window) : false;
  const install = usePwaInstall({ userAgent, isStandalone });

  if (update.bannerVisible) {
    return <UpdateAvailableBanner onRefresh={update.refreshNow} onDismiss={update.dismiss} />;
  }

  if (install.kind === "android-prompt") {
    return (
      <InstallPromptBanner onInstall={() => void install.install()} onDismiss={install.dismiss} />
    );
  }

  if (install.kind === "ios-hint") {
    return <IosInstallHint onDismiss={install.dismiss} />;
  }

  return null;
}
