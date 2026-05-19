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
  const { engineState, togglePlay, loadPreview } = usePlayer();
  const [onboarded, setOnboarded] = useState(() => readOnboardedFlag());

  const top = items[0] ?? null;
  const { getCachedStreamUrl } = useTopCardPreview(items);

  // Live items ref so the on-screen ✕ / ♥ buttons' advance() callback
  // reads the latest items without being re-bound on every queue change.
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const dismissOnboarding = useCallback(() => {
    writeOnboardedFlag();
    setOnboarded(true);
  }, []);

  // UI-29 + UI-31: before advancing the queue (which is async via
  // setItems → render → effect → loadPreview), synchronously load the
  // next track via `loadPreview`. `loadPreview` is now itself synchronous
  // (no RAF, no fade), so audio.src = newUrl + audio.play() happens
  // within the same microtask as the click — the user gets immediate
  // silence on the old track and the new track starts as soon as the
  // resource is ready.
  const advance = useCallback(
    (direction: "right" | "left") => {
      const list = itemsRef.current;
      const nextSnap = list[1];
      if (nextSnap !== undefined) {
        const cached = getCachedStreamUrl(nextSnap);
        if (cached !== null) {
          loadPreview(nextSnap, cached);
        }
      }
      swipe(direction);
    },
    [getCachedStreamUrl, loadPreview, swipe],
  );

  const onLike = useCallback(() => advance("right"), [advance]);
  const onPass = useCallback(() => advance("left"), [advance]);
  // UI-40: OS Media Session next/prev are wired by the top-level
  // ExploreMediaBridge component (mounted in App), NOT by ExplorePage —
  // so the lock-screen controls keep advancing the Explore queue even
  // after the user navigates away to another tab.

  // UI-30: the deck never advances on engine "failed". A previous version
  // of this component scheduled a 5-second `swipe("left")` whenever the
  // engine entered "failed" — that auto-skip is intentionally absent.
  // UI-21's retry in useTopCardPreview is the only response to failure;
  // if it does not recover, the card persists until the user swipes.

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
