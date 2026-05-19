import type { ReactNode } from "react";

export interface BannerProps {
  /** Used for `aria-labelledby` so screen readers can announce the banner. */
  id: string;
  /** Short heading shown bold. */
  title: string;
  /** Sub-text under the heading. */
  body: string;
  /**
   * One or two `Button`s from `@moc/design-system`. Rendered in a flex
   * row at the bottom of the banner so the primary action sits on the
   * right per platform conventions.
   */
  actions: ReactNode;
}

/**
 * Feature-private visual primitive for the two PWA banners and the iOS
 * install hint. A fixed-position card pinned above the bottom nav,
 * built from DS tokens — never the DS itself. If a second consumer
 * appears outside `features/pwa/`, promote this to the design system
 * via /design-system.
 *
 * Pinned bottom: above the safe-area inset (`env(safe-area-inset-
 * bottom)`) and above the BottomNav (the BottomNav is ~64px tall, so
 * we offset by 4.5rem to clear it). On a 375x667 viewport this leaves
 * the banner just above the nav without overlap.
 */
export function Banner({ id, title, body, actions }: BannerProps): JSX.Element {
  return (
    <div
      role="dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      className={[
        // Position: fixed above the bottom nav, with safe-area padding.
        "fixed inset-x-0 z-modal",
        "px-4",
        "pointer-events-none", // Only the inner card receives clicks.
      ].join(" ")}
      style={{
        // Calc clears the BottomNav (≈4.5rem) plus the safe-area inset.
        bottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div
        className={[
          "pointer-events-auto",
          "mx-auto max-w-md",
          "bg-surface text-text",
          "rounded-lg shadow-lg",
          "border border-border",
          "p-4",
          "flex flex-col gap-3",
        ].join(" ")}
      >
        <div className="flex flex-col gap-1">
          <h2 id={`${id}-title`} className="text-md font-semibold text-text">
            {title}
          </h2>
          <p id={`${id}-body`} className="text-sm text-text-muted">
            {body}
          </p>
        </div>
        <div className="flex justify-end gap-2">{actions}</div>
      </div>
    </div>
  );
}
