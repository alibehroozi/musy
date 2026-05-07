import type { Story } from "@ladle/react";
import { Typography, type TypographyVariant } from "./Typography.js";

export default {
  title: "Typography",
};

const variants: TypographyVariant[] = ["h1", "h2", "h3", "body", "caption"];

export const Variants: Story = () => (
  <div className="bg-bg p-6 flex flex-col gap-4">
    {variants.map((v) => (
      <div key={v} className="flex flex-col gap-1">
        <Typography variant="caption">variant={v}</Typography>
        <Typography variant={v}>The quick brown fox jumps over the lazy dog</Typography>
      </div>
    ))}
  </div>
);
