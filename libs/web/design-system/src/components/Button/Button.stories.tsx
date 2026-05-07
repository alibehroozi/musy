import type { Story } from "@ladle/react";
import { Button, type ButtonVariant, type ButtonSize } from "./Button.js";
import { Typography } from "../Typography/Typography.js";

export default {
  title: "Button",
};

const variants: ButtonVariant[] = ["primary", "secondary", "ghost"];
const sizes: ButtonSize[] = ["sm", "md", "lg"];

export const Variants: Story = () => (
  <div className="bg-bg p-6 flex flex-col gap-6">
    {variants.map((v) => (
      <div key={v} className="flex flex-col gap-2">
        <Typography variant="caption">variant={v}</Typography>
        <div className="flex items-center gap-3">
          {sizes.map((s) => (
            <Button key={s} variant={v} size={s}>
              {v} {s}
            </Button>
          ))}
        </div>
      </div>
    ))}
  </div>
);

export const Disabled: Story = () => (
  <div className="bg-bg p-6 flex items-center gap-3">
    <Button variant="primary" disabled>
      Disabled primary
    </Button>
    <Button variant="secondary" disabled>
      Disabled secondary
    </Button>
    <Button variant="ghost" disabled>
      Disabled ghost
    </Button>
  </div>
);
