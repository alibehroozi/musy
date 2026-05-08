import { type ReactNode, useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { IconButton } from "../IconButton/IconButton.js";
import { Icon } from "../Icon/Icon.js";

export type ModalVariant = "sheet" | "center";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** "sheet" slides up from bottom on mobile; "center" is always centered. Default: "sheet" */
  variant?: ModalVariant;
  /** data-testid applied to the dialog element */
  testId?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  variant = "sheet",
  testId,
}: ModalProps): JSX.Element | null {
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

  const isCenter = variant === "center";

  const wrapperCls = [
    "fixed inset-0 z-modal flex justify-center",
    isCenter ? "items-center px-6" : "items-end sm:items-center",
  ].join(" ");

  const dialogCls = isCenter
    ? "relative z-modal w-full max-w-xs bg-white rounded-2xl shadow-lg overflow-hidden"
    : "relative z-modal w-full sm:max-w-sm bg-surface rounded-t-lg sm:rounded-lg shadow-lg pb-[env(safe-area-inset-bottom)]";

  return (
    <div
      role="presentation"
      className={wrapperCls}
      onClick={handleBackdropClick}
      onKeyDown={handleBackdropKeyDown}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={dialogRef}
        className={dialogCls}
        data-testid={testId}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <p id="modal-title" className="text-base font-semibold text-text">
            {title}
          </p>
          <IconButton label="Close" size="sm" onClick={onClose}>
            <Icon name="x" size={16} />
          </IconButton>
        </div>

        {/* Body */}
        <div className="px-4 pb-4">{children}</div>

        {/* Footer */}
        {footer !== undefined && <div className="px-4 pb-4">{footer}</div>}
      </div>
    </div>
  );
}
