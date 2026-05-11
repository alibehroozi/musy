import { useCallback, useEffect, useRef, useState } from "react";
import { Typography } from "@moc/design-system";
import { useAuth } from "../../hooks/useAuth.js";
import { usePlayer } from "../player/usePlayer.js";
import { CardStack } from "./components/CardStack.js";
import { ActionRow } from "./components/ActionRow.js";
import { PhasePill } from "./components/PhasePill.js";
import { OnboardingOverlay } from "./components/OnboardingOverlay.js";
import { RefillingState } from "./components/RefillingState.js";
import { useExploreQueue } from "./hooks/useExploreQueue.js";
import { useTopCardPreview } from "./hooks/useTopCardPreview.js";

const ONBOARDED_KEY = "moc.explore.onboarded";

function readOnboardedFlag(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeOnboardedFlag(): void {
  try {
    localStorage.setItem(ONBOARDED_KEY, "1");
  } catch {
    /* localStorage disabled — onboarding will re-show next visit, acceptable per spec. */
  }
}

export function ExplorePage(): JSX.Element {
  const { state: authState } = useAuth();
  const { items, phase, status, swipe, retry } = useExploreQueue();
  const { engineState, togglePlay } = usePlayer();
  const [onboarded, setOnboarded] = useState(() => readOnboardedFlag());

  const top = items[0] ?? null;
  useTopCardPreview(items);

  const dismissOnboarding = useCallback(() => {
    writeOnboardedFlag();
    setOnboarded(true);
  }, []);

  const onLike = useCallback(() => swipe("right"), [swipe]);
  const onPass = useCallback(() => swipe("left"), [swipe]);

  // Wire OS media-session next/prev to like/pass while Explore is mounted.
  const { registerMediaOverrides } = usePlayer();
  useEffect(() => {
    const cleanup = registerMediaOverrides({ onNext: onLike, onPrev: onPass });
    return cleanup;
  }, [registerMediaOverrides, onLike, onPass]);

  // Auto-skip when the preview is unresolvable (provider 404). Per spec:
  // 5 s → next card; no swipe event written.
  useEffect(() => {
    if (engineState.status !== "failed") return undefined;
    const t = setTimeout(() => {
      // Drop the top card without recording a verdict.
      if (items.length > 0) swipe("left");
    }, 5_000);
    return () => clearTimeout(t);
  }, [engineState.status, items.length, swipe]);

  // Auto-advance (like) when the full preview plays to the end.
  // topRef lets the effect read the current top card without listing it as
  // a dep: adding `top` as a dep would cause the effect to re-run the moment
  // a swipe changes `items`, while the engine is still in "ended" (the 250ms
  // fade runs before the status flips to "loading"), triggering a cascade of
  // unwanted extra swipes.
  const topRef = useRef(top);
  topRef.current = top;
  const autoAdvancedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (engineState.status !== "ended") return;
    const currentTop = topRef.current;
    if (currentTop === null) return;
    const key = `${currentTop.title.trim().toLowerCase()}|${currentTop.artist.trim().toLowerCase()}`;
    if (autoAdvancedKeyRef.current === key) return;
    autoAdvancedKeyRef.current = key;
    swipe("right");
  }, [engineState.status, swipe]);

  if (authState.status === "loading") {
    return <main className="flex flex-col h-full" />;
  }

  if (authState.status !== "authenticated") {
    return (
      <main className="flex flex-col h-full items-center justify-center p-6 text-center gap-4">
        <Typography variant="h2">Sign in to explore</Typography>
        <Typography variant="body" className="text-text-muted max-w-sm">
          Discover new music and shape your taste profile by signing in.
        </Typography>
      </main>
    );
  }

  const isPlaying = engineState.status === "playing";
  const showRefilling =
    items.length === 0 && (status === "empty" || status === "loading" || status === "error");

  return (
    <main className="flex flex-col h-full" data-testid="explore-page">
      {/* Topbar */}
      <header className="flex items-center justify-between px-4 h-12 border-b border-border">
        <Typography variant="h3">Explore</Typography>
        <PhasePill phase={phase} />
      </header>

      {showRefilling ? (
        <RefillingState onRetry={retry} />
      ) : (
        <CardStack
          items={items}
          onSwipe={swipe}
          overlay={!onboarded ? <OnboardingOverlay onDismiss={dismissOnboarding} /> : undefined}
        />
      )}

      <ActionRow
        isPlaying={isPlaying}
        disabled={top === null}
        onPass={onPass}
        onTogglePlay={togglePlay}
        onLike={onLike}
      />
    </main>
  );
}
