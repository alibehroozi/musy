import { useEffect, useState } from "react";
import { Button, Input, Modal, Typography } from "@moc/design-system";
import { HttpError, requestCustomMix } from "@moc/web-core";

interface MixModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Called after a 200 response — the page uses this to imperatively
   * refresh the profile so the just-created "Building…" card appears
   * at the top of the grid without waiting the full polling cadence.
   */
  onSuccess: () => void;
}

const MAX_PROMPT_LEN = 500;

/**
 * UI-35: the ✨ New mix modal. Single Input + Cancel + Generate. The
 * Generate button is disabled while the prompt is empty (after trim)
 * or longer than 500 chars. On success the modal unmounts; on a 4xx /
 * 5xx response we render the matching inline error and keep the modal
 * open so the user can edit and retry.
 */
export function MixModal({ open, onClose, onSuccess }: MixModalProps): JSX.Element | null {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI-35: reset state when the modal transitions from closed→open;
  // focus the input within a microtask of the dialog mounting so the
  // user can start typing immediately.
  useEffect(() => {
    if (!open) {
      setValue("");
      setError(null);
      setSubmitting(false);
      return;
    }
    queueMicrotask(() => {
      const el = document.querySelector<HTMLInputElement>(
        '[role="dialog"] input[aria-label="Mix prompt"]',
      );
      el?.focus();
    });
  }, [open]);

  if (!open) return null;

  const trimmedLength = value.trim().length;
  const isValid =
    !submitting &&
    trimmedLength > 0 &&
    trimmedLength <= MAX_PROMPT_LEN &&
    value.length <= MAX_PROMPT_LEN;
  const tooLong = value.length > MAX_PROMPT_LEN;

  const handleSubmit = async (): Promise<void> => {
    if (!isValid) return;
    setSubmitting(true);
    setError(null);
    try {
      await requestCustomMix(value);
      onSuccess();
      onClose();
    } catch (e: unknown) {
      setSubmitting(false);
      setError(errorMessageFor(e));
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Request a taste mix"
      footer={
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" size="md" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              void handleSubmit();
            }}
            disabled={!isValid}
          >
            Generate
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Typography variant="body" className="text-text-muted">
          Describe the mood — we&apos;ll find the songs from your taste.
        </Typography>
        <Input
          type="text"
          placeholder="e.g. dreamy late-night focus"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error !== null) setError(null);
          }}
          aria-label="Mix prompt"
          aria-invalid={tooLong || undefined}
          autoComplete="off"
          maxLength={MAX_PROMPT_LEN + 50}
          disabled={submitting}
        />
        {tooLong && (
          <Typography variant="caption" className="text-text-muted">
            Prompts are capped at {MAX_PROMPT_LEN} characters.
          </Typography>
        )}
        {error !== null && (
          <div
            role="alert"
            className="text-sm rounded-md px-3 py-2"
            style={{
              background: "color-mix(in oklab, var(--color-danger) 12%, transparent)",
              color: "var(--color-text)",
              border: "1px solid var(--color-danger)",
            }}
            data-testid="mix-modal-error"
          >
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

function errorMessageFor(e: unknown): string {
  if (e instanceof HttpError) {
    if (e.status === 422) {
      return "Swipe right on some songs in Explore first so we have material to work with.";
    }
    if (e.status === 429) {
      return "You already have a mix building. Wait for it to finish.";
    }
    return "Something went wrong. Try again.";
  }
  return "Couldn't reach the server. Try again.";
}
