import { type ReactNode, useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, children, footer }: ModalProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const focusableSelector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    first?.focus();

    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab") {
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function handleBackdropClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleBackdropKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") onClose();
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-modal flex items-end sm:items-center justify-center"
      onClick={handleBackdropClick}
      onKeyDown={handleBackdropKeyDown}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-bg/80" aria-hidden />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={dialogRef}
        className="relative z-modal w-full sm:max-w-sm bg-surface rounded-t-lg sm:rounded-lg shadow-lg pb-[env(safe-area-inset-bottom)]"
        data-testid="sign-in-modal"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <p id="modal-title" className="text-lg font-semibold text-text">
            {title}
          </p>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="p-2 text-text-muted hover:text-text transition-colors rounded"
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
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-4 pb-4">{children}</div>

        {/* Footer */}
        {footer !== undefined && <div className="px-4 pb-4">{footer}</div>}
      </div>
    </div>
  );
}
