import { useState } from "react";
import { Modal } from "./Modal.js";
import { Button } from "../Button/Button.js";

export function Default() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open Modal</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Sign in to save songs"
        footer={
          <Button variant="primary" size="lg" style={{ width: "100%" }}>
            Continue with Google
          </Button>
        }
      >
        <p style={{ color: "var(--color-text-muted)" }}>
          Sign in with Google to save songs you like and shape your taste profile.
        </p>
      </Modal>
    </>
  );
}
