import { Button } from "@moc/design-system";
import { Banner } from "./Banner.js";

export interface UpdateAvailableBannerProps {
  onRefresh: () => void;
  onDismiss: () => void;
}

export function UpdateAvailableBanner({
  onRefresh,
  onDismiss,
}: UpdateAvailableBannerProps): JSX.Element {
  return (
    <Banner
      id="pwa-update"
      title="A new version of musy is ready"
      body="Refresh to load the latest. We'll auto-apply the next time you reopen the app if you're idle."
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Later
          </Button>
          <Button variant="primary" size="sm" onClick={onRefresh}>
            Refresh now
          </Button>
        </>
      }
    />
  );
}
