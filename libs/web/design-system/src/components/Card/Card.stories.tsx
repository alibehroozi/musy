import type { Story } from "@ladle/react";
import { Card } from "./Card.js";
import { Typography } from "../Typography/Typography.js";

export default {
  title: "Card",
};

export const Default: Story = () => (
  <div className="bg-bg p-6 min-h-screen flex items-start justify-center">
    <Card className="w-72 flex flex-col gap-3">
      <div className="aspect-square w-full bg-primary rounded-md" aria-hidden />
      <Typography variant="body">Track title</Typography>
      <Typography variant="caption" className="text-text-muted">
        Artist name
      </Typography>
    </Card>
  </div>
);

export const WithOverlay: Story = () => (
  <div className="bg-bg p-6 min-h-screen flex items-start justify-center">
    <Card
      className="w-72 flex flex-col gap-3"
      overlay={
        <div className="bg-surface border border-border rounded-md p-4 mx-6 text-center">
          <Typography variant="body" className="font-semibold mb-1">
            Welcome to Explore
          </Typography>
          <Typography variant="caption" className="text-text-muted">
            Swipe right to like, left to pass.
          </Typography>
        </div>
      }
    >
      <div className="aspect-square w-full bg-primary rounded-md" aria-hidden />
      <Typography variant="body">Track title</Typography>
      <Typography variant="caption" className="text-text-muted">
        Artist name
      </Typography>
    </Card>
  </div>
);
