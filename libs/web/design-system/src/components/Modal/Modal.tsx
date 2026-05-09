import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface ModalProps {
  /** Controls visibility. When false, the Modal returns null. */
  open: boolean;
  /** Called on backdrop click, ESC keypress, or close X button. */
  onClose: () => void;
  /** Accessible name for the dialog (announced to screen readers). */
  title: string;
  /** Modal body. */
  children: ReactNode;
  /** Optional footer slot — useful for a sticky CTA row. */
  footer?: ReactNode;
}

/**
 * Mobile-first sign-in / confirmation Modal.
 *
 * Layout: dimmed backdrop fills the viewport; a single centered card
 * holds the content. Card width is capped on larger screens so the
 * content doesn't span the whole screen.
 *
 * z-index: --z-modal — above the fixed bottom navigation (UI-10).
 *
 * Accessibility:
 *  - role="dialog", aria-modal="true", aria-labelledby
 *  - ESC dismisses
 *  - Backdrop click dismisses (click-through guard on card)
 *  - Body scroll is locked while open
 */
export function Modal({ open, onClose, title, children, footer }: ModalProps): JSX.Element | null {
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2, 9)}`).current;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const handleBackdropKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "Escape") onClose();
  };

  const node = (
    <div
      className="fixed inset-0 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm"
      style={{ zIndex: "var(--z-modal)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
      onKeyDown={handleBackdropKeyDown}
      data-testid="modal-backdrop"
    >
      <div
        className="w-full max-w-sm bg-surface text-text rounded-lg shadow-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        data-testid="modal-card"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <h2 id={titleId} className="text-xl font-semibold text-text">
            {title}
          </h2>
          <CloseButton onClose={onClose} />
        </div>
        <div className="px-5 py-4 text-text">{children}</div>
        {footer ? <div className="px-5 pb-5 pt-1">{footer}</div> : null}
      </div>
    </div>
  );

  return typeof document === "undefined" ? node : createPortal(node, document.body);
}

function CloseButton({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className={
        "shrink-0 inline-flex items-center justify-center size-11 rounded-full " +
        "text-text-muted hover:text-text hover:bg-border " +
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
        "focus-visible:outline-primary"
      }
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        focusable="false"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}
