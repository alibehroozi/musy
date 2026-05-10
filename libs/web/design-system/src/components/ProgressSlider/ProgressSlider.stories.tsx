import type { Story } from "@ladle/react";
import { useState } from "react";
import { ProgressSlider } from "./ProgressSlider.js";

export default {
  title: "ProgressSlider",
};

export const Idle: Story = () => (
  <div className="bg-bg p-6" style={{ width: 327 }}>
    <ProgressSlider valueFraction={0} ariaLabel="Playback position" />
  </div>
);

export const MidProgress: Story = () => (
  <div className="bg-bg p-6" style={{ width: 327 }}>
    <ProgressSlider valueFraction={0.32} ariaLabel="Playback position" />
  </div>
);

export const NearEnd: Story = () => (
  <div className="bg-bg p-6" style={{ width: 327 }}>
    <ProgressSlider valueFraction={0.97} ariaLabel="Playback position" />
  </div>
);

export const Interactive: Story = () => {
  const [v, setV] = useState(0.4);
  return (
    <div className="bg-bg p-6 space-y-3" style={{ width: 327 }}>
      <ProgressSlider
        valueFraction={v}
        ariaLabel="Playback position"
        onScrub={(f) => setV(f)}
        onScrubEnd={(f) => setV(f)}
      />
      <p className="text-text-muted text-sm">value: {(v * 100).toFixed(1)}%</p>
    </div>
  );
};
