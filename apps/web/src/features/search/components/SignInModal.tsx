import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { useAuthContext } from "../../../contexts/AuthContext.js";
import { GOOGLE_LOGIN_URL } from "../../auth/api.js";

interface SignInModalProps {
  open: boolean;
  onClose: () => void;
}

function GoogleIcon(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.08 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-3.59-13.46-8.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}

export function SignInModal({ open, onClose }: SignInModalProps): JSX.Element | null {
  const { state } = useAuthContext();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status === "authenticated" && open) {
      onClose();
    }
  }, [state.status, open, onClose]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
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
      className="fixed inset-0 z-modal flex items-center justify-center px-6"
      onClick={handleBackdropClick}
      onKeyDown={handleBackdropKeyDown}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden />

      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sign-in-title"
        ref={dialogRef}
        data-testid="sign-in-modal"
        className="relative w-full max-w-xs bg-white rounded-2xl shadow-lg overflow-hidden"
      >
        {/* Close button */}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        {/* Top accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-[#EA4335] via-[#FBBC05] to-[#4285F4]" aria-hidden />

        {/* Content */}
        <div className="px-6 pt-8 pb-7 flex flex-col items-center text-center gap-5">
          {/* Logo mark */}
          <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center shadow-sm">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M9 18V5l12-2v13" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="6" cy="18" r="3" stroke="#6b7280" strokeWidth="1.5" />
              <circle cx="18" cy="16" r="3" stroke="#6b7280" strokeWidth="1.5" />
            </svg>
          </div>

          {/* Heading */}
          <div className="flex flex-col gap-1.5">
            <p id="sign-in-title" className="text-gray-900 text-base font-semibold leading-snug">
              To continue, sign in using<br />your Google account
            </p>
            <p className="text-gray-400 text-xs leading-relaxed">
              Save songs and shape your taste profile
            </p>
          </div>

          {/* Google button */}
          <button
            type="button"
            onClick={() => { window.location.href = GOOGLE_LOGIN_URL; }}
            className="w-full flex items-center justify-center gap-3 bg-white border border-gray-200 rounded-xl py-3 px-4 text-gray-700 text-sm font-medium shadow-sm hover:bg-gray-50 hover:shadow-md active:scale-95 transition-all"
          >
            <GoogleIcon />
            <span>Sign in with Google</span>
          </button>
        </div>
      </div>
    </div>
  );
}
