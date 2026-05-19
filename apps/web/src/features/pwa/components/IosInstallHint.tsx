import { Button } from "@moc/design-system";
import { Banner } from "./Banner.js";

export interface IosInstallHintProps {
  onDismiss: () => void;
}

/**
 * iOS Safari ignores `beforeinstallprompt` — installation is manual,
 * via the share sheet. This hint walks the user through it once;
 * dismissing persists in `localStorage` so we don't pester on every
 * load.
 */
export function IosInstallHint({ onDismiss }: IosInstallHintProps): JSX.Element {
  return (
    <Banner
      id="pwa-ios-hint"
      title="Add musy to your Home Screen"
      body="Tap the Share button below, then choose 'Add to Home Screen' to install musy."
      actions={
        <Button variant="primary" size="sm" onClick={onDismiss}>
          Got it
        </Button>
      }
    />
  );
}
