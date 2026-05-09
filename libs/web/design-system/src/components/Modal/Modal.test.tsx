import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Modal } from "./Modal.js";

describe("Modal", () => {
  it("returns null when open is false", () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}} title="Hi">
        body
      </Modal>,
    );
    expect(container.firstChild).toBeNull();
    cleanup();
  });

  it("renders dialog role with the given title as accessible name", () => {
    render(
      <Modal open onClose={() => {}} title="Sign in to save songs">
        body
      </Modal>,
    );
    expect(screen.getByRole("dialog", { name: "Sign in to save songs" })).toBeInTheDocument();
    cleanup();
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Hi">
        body
      </Modal>,
    );
    fireEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("does not call onClose when the card itself is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Hi">
        body
      </Modal>,
    );
    fireEvent.click(screen.getByTestId("modal-card"));
    expect(onClose).not.toHaveBeenCalled();
    cleanup();
  });

  it("calls onClose when the Close button is pressed", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Hi">
        body
      </Modal>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("uses the --z-modal token as its z-index", () => {
    render(
      <Modal open onClose={() => {}} title="Hi">
        body
      </Modal>,
    );
    expect(screen.getByTestId("modal-backdrop").style.zIndex).toBe("var(--z-modal)");
    cleanup();
  });

  it("renders into document.body so it escapes nested stacking contexts", () => {
    render(
      <Modal open onClose={() => {}} title="Hi">
        body
      </Modal>,
    );
    expect(screen.getByTestId("modal-backdrop").parentElement).toBe(document.body);
    cleanup();
  });
});
