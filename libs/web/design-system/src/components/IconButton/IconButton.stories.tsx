import type { Story } from "@ladle/react";
import { IconButton } from "./IconButton.js";
import { Icon } from "../Icon/Icon.js";
import { Typography } from "../Typography/Typography.js";

export default {
  title: "IconButton",
};

export const Variants: Story = () => (
  <div className="bg-bg p-6 flex flex-col gap-6">
    <div className="flex flex-col gap-2">
      <Typography variant="caption">variant=default</Typography>
      <div className="flex items-center gap-3">
        <IconButton aria-label="Save" size="sm">
          <Icon name="heart" size={20} />
        </IconButton>
        <IconButton aria-label="Save" size="md">
          <Icon name="heart" size={22} />
        </IconButton>
        <IconButton aria-label="Save" size="lg">
          <Icon name="heart" size={26} />
        </IconButton>
      </div>
    </div>
    <div className="flex flex-col gap-2">
      <Typography variant="caption">variant=filled</Typography>
      <div className="flex items-center gap-3">
        <IconButton aria-label="Saved" variant="filled" size="sm">
          <Icon name="heart-filled" size={20} />
        </IconButton>
        <IconButton aria-label="Saved" variant="filled" size="md">
          <Icon name="heart-filled" size={22} />
        </IconButton>
        <IconButton aria-label="Saved" variant="filled" size="lg">
          <Icon name="heart-filled" size={26} />
        </IconButton>
      </div>
    </div>
    <div className="flex flex-col gap-2">
      <Typography variant="caption">variant=success</Typography>
      <div className="flex items-center gap-3">
        <IconButton aria-label="Like" variant="success" size="sm">
          <Icon name="heart" size={20} />
        </IconButton>
        <IconButton aria-label="Like" variant="success" size="md">
          <Icon name="heart" size={22} />
        </IconButton>
        <IconButton aria-label="Like" variant="success" size="lg">
          <Icon name="heart" size={26} />
        </IconButton>
      </div>
    </div>
    <div className="flex flex-col gap-2">
      <Typography variant="caption">variant=danger</Typography>
      <div className="flex items-center gap-3">
        <IconButton aria-label="Pass" variant="danger" size="sm">
          <Icon name="x" size={20} />
        </IconButton>
        <IconButton aria-label="Pass" variant="danger" size="md">
          <Icon name="x" size={22} />
        </IconButton>
        <IconButton aria-label="Pass" variant="danger" size="lg">
          <Icon name="x" size={26} />
        </IconButton>
      </div>
    </div>
  </div>
);

export const Disabled: Story = () => (
  <div className="bg-bg p-6 flex items-center gap-3">
    <IconButton aria-label="Pass" variant="danger" size="lg" disabled>
      <Icon name="x" size={26} />
    </IconButton>
    <IconButton aria-label="Like" variant="success" size="lg" disabled>
      <Icon name="heart" size={26} />
    </IconButton>
    <IconButton aria-label="Save" disabled>
      <Icon name="heart" size={20} />
    </IconButton>
  </div>
);
