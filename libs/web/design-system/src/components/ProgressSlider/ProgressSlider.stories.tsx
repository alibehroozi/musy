import { useState } from "react";
import type { Story } from "@ladle/react";
import { ProgressSlider } from "./ProgressSlider.js";

export const Idle: Story = () => (
  <div className="p-8 bg-bg">
    <ProgressSlider
      valueFraction={0}
      onScrub={() => {}}
      onScrubEnd={() => {}}
      ariaLabel="Playback progress"
    />
  </div>
);

export const MidTrack: Story = () => (
  <div className="p-8 bg-bg">
    <ProgressSlider
      valueFraction={0.42}
      onScrub={() => {}}
      onScrubEnd={() => {}}
      ariaLabel="Playback progress"
    />
  </div>
);

export const AtEnd: Story = () => (
  <div className="p-8 bg-bg">
    <ProgressSlider
      valueFraction={1}
      onScrub={() => {}}
      onScrubEnd={() => {}}
      ariaLabel="Playback progress"
    />
  </div>
);

export const Interactive: Story = () => {
  const [value, setValue] = useState(0.3);
  return (
    <div className="p-8 bg-bg space-y-4">
      <p className="text-sm text-text-muted">Fraction: {value.toFixed(2)}</p>
      <ProgressSlider
        valueFraction={value}
        onScrub={setValue}
        onScrubEnd={setValue}
        ariaLabel="Playback progress"
      />
    </div>
  );
};
