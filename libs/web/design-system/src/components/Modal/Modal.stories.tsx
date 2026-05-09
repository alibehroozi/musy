import type { Story } from "@ladle/react";
import { useState } from "react";
import { Modal } from "./Modal.js";
import { Button } from "../Button/Button.js";
import { Icon } from "../Icon/Icon.js";
import { Typography } from "../Typography/Typography.js";

export default {
  title: "Modal",
};

export const SignInGate: Story = () => {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-bg p-6 min-h-screen">
      <Button onClick={() => setOpen(true)}>Open modal</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Sign in to save songs">
        <Typography variant="body" className="text-text-muted mb-6">
          Sign in with Google to save songs you like and shape your taste profile.
        </Typography>
        <Button variant="primary" size="lg" className="w-full">
          <Icon name="google-brand" size={20} className="shrink-0" />
          <span>Continue with Google</span>
        </Button>
      </Modal>
    </div>
  );
};
