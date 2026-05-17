import { useNavigate } from "react-router-dom";
import { Button, Typography } from "@moc/design-system";

/**
 * UI-33: empty Taste tab — no buckets yet. Drives users into Explore
 * so swipes can seed the auto-bucket builder. The 'Import from Spotify'
 * surface is rendered disabled with a 'Coming soon' caption — a
 * placeholder for the post-MVP integration.
 */
export function EmptyState(): JSX.Element {
  const navigate = useNavigate();
  return (
    <main className="flex flex-col items-center justify-center min-h-full px-6 py-12 text-center">
      <div
        aria-hidden
        className="w-22 h-22 rounded-full bg-surface border border-border flex items-center justify-center text-4xl mb-6"
        style={{ width: 88, height: 88 }}
      >
        🎵
      </div>
      <Typography variant="h1" className="mb-2 text-xl">
        Build your Taste
      </Typography>
      <Typography variant="body" className="text-text-muted mb-8">
        <span style={{ display: "inline-block", maxWidth: 260 }}>
          Swipe in Explore to create your buckets — they&apos;ll appear here once we have enough
          signal.
        </span>
      </Typography>
      <div className="w-full flex flex-col gap-3" style={{ maxWidth: 280 }}>
        <Button
          variant="primary"
          size="lg"
          onClick={() => navigate("/explore")}
          className="w-full justify-center min-h-11"
        >
          Go to Explore →
        </Button>
        <Button
          variant="ghost"
          size="lg"
          disabled
          aria-disabled="true"
          className="w-full justify-center min-h-11 border border-border"
        >
          Import from Spotify
        </Button>
        <Typography variant="caption" className="text-text-muted -mt-1">
          Coming soon
        </Typography>
      </div>
    </main>
  );
}
