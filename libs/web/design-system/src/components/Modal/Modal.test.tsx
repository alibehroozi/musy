// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Modal } from "./Modal.js";

describe("Modal", () => {
  it("renders nothing when open is false", () => {
    render(
      <Modal open={false} onClose={() => {}} title="Test">
        <p>body</p>
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the dialog when open is true", () => {
    render(
      <Modal open={true} onClose={() => {}} title="Test">
        <p>body</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows the title", () => {
    render(
      <Modal open={true} onClose={() => {}} title="Sign in">
        <p>body</p>
      </Modal>,
    );
    expect(screen.getByText("Sign in")).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Test">
        <p>body</p>
      </Modal>,
    );
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Test">
        <p>body</p>
      </Modal>,
    );
    const backdrop = screen.getByRole("presentation");
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose on ESC key", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Test">
        <p>body</p>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders footer when provided", () => {
    render(
      <Modal open={true} onClose={() => {}} title="Test" footer={<button>OK</button>}>
        <p>body</p>
      </Modal>,
    );
    expect(screen.getByText("OK")).toBeInTheDocument();
  });

  it("applies z-modal class", () => {
    render(
      <Modal open={true} onClose={() => {}} title="Test">
        <p>body</p>
      </Modal>,
    );
    const backdrop = screen.getByRole("presentation");
    expect(backdrop.className).toContain("z-modal");
  });

  it("has aria-modal and aria-labelledby on the dialog", () => {
    render(
      <Modal open={true} onClose={() => {}} title="Test">
        <p>body</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "modal-title");
  });
});
