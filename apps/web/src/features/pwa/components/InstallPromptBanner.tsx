import { Button } from "@moc/design-system";
import { Banner } from "./Banner.js";

export interface InstallPromptBannerProps {
  onInstall: () => void;
  onDismiss: () => void;
}

export function InstallPromptBanner({
  onInstall,
  onDismiss,
}: InstallPromptBannerProps): JSX.Element {
  return (
    <Banner
      id="pwa-install"
      title="Install musy on your device"
      body="Add musy to your home screen for a faster, full-screen experience."
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Not now
          </Button>
          <Button variant="primary" size="sm" onClick={onInstall}>
            Install
          </Button>
        </>
      }
    />
  );
}
