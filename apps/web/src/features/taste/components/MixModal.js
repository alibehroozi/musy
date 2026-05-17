import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Button, Input, Modal, Typography } from "@moc/design-system";
import { HttpError, requestCustomMix } from "@moc/web-core";
const MAX_PROMPT_LEN = 500;
/**
 * UI-35: the ✨ New mix modal. Single Input + Cancel + Generate. The
 * Generate button is disabled while the prompt is empty (after trim)
 * or longer than 500 chars. On success the modal unmounts; on a 4xx /
 * 5xx response we render the matching inline error and keep the modal
 * open so the user can edit and retry.
 */
export function MixModal({ open, onClose, onSuccess }) {
    const [value, setValue] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
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
            const el = document.querySelector('[role="dialog"] input[aria-label="Mix prompt"]');
            el?.focus();
        });
    }, [open]);
    if (!open)
        return null;
    const trimmedLength = value.trim().length;
    const isValid = !submitting && trimmedLength > 0 && trimmedLength <= MAX_PROMPT_LEN && value.length <= MAX_PROMPT_LEN;
    const tooLong = value.length > MAX_PROMPT_LEN;
    const handleSubmit = async () => {
        if (!isValid)
            return;
        setSubmitting(true);
        setError(null);
        try {
            await requestCustomMix(value);
            onSuccess();
            onClose();
        }
        catch (e) {
            setSubmitting(false);
            setError(errorMessageFor(e));
        }
    };
    return (_jsx(Modal, { open: true, onClose: onClose, title: "Request a taste mix", footer: _jsxs("div", { className: "flex gap-3 justify-end", children: [_jsx(Button, { variant: "ghost", size: "md", onClick: onClose, disabled: submitting, children: "Cancel" }), _jsx(Button, { variant: "primary", size: "md", onClick: () => {
                        void handleSubmit();
                    }, disabled: !isValid, children: "Generate" })] }), children: _jsxs("div", { className: "flex flex-col gap-3", children: [_jsx(Typography, { variant: "body", className: "text-text-muted", children: "Describe the mood \u2014 we'll find the songs from your taste." }), _jsx(Input, { type: "text", placeholder: "e.g. dreamy late-night focus", value: value, onChange: (e) => {
                        setValue(e.target.value);
                        if (error !== null)
                            setError(null);
                    }, "aria-label": "Mix prompt", "aria-invalid": tooLong || undefined, autoComplete: "off", maxLength: MAX_PROMPT_LEN + 50, disabled: submitting }), tooLong && (_jsxs(Typography, { variant: "caption", className: "text-text-muted", children: ["Prompts are capped at ", MAX_PROMPT_LEN, " characters."] })), error !== null && (_jsx("div", { role: "alert", className: "text-sm rounded-md px-3 py-2", style: {
                        background: "color-mix(in oklab, var(--color-danger) 12%, transparent)",
                        color: "var(--color-text)",
                        border: "1px solid var(--color-danger)",
                    }, "data-testid": "mix-modal-error", children: error }))] }) }));
}
function errorMessageFor(e) {
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
