import type { Story } from "@ladle/react";
import { ListItemButton } from "./ListItemButton.js";
import { Typography } from "../Typography/Typography.js";

export default {
  title: "ListItemButton",
};

function ClockGlyph(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function Frame({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="bg-bg p-6 max-w-md flex flex-col gap-6">{children}</div>;
}

export const Default: Story = () => (
  <Frame>
    <ListItemButton>Plain row</ListItemButton>
  </Frame>
);

export const WithLeading: Story = () => (
  <Frame>
    <ListItemButton
      leading={
        <span className="text-text-muted">
          <ClockGlyph />
        </span>
      }
    >
      With leading icon
    </ListItemButton>
  </Frame>
);

export const WithTrailing: Story = () => (
  <Frame>
    <ListItemButton trailing={<span className="text-xs text-text-muted">2h ago</span>}>
      With trailing meta
    </ListItemButton>
  </Frame>
);

export const WithBoth: Story = () => (
  <Frame>
    <ListItemButton
      leading={
        <span className="text-text-muted">
          <ClockGlyph />
        </span>
      }
      trailing={<span className="text-xs text-text-muted">2h ago</span>}
    >
      Recent search query
    </ListItemButton>
  </Frame>
);

export const InAList: Story = () => (
  <Frame>
    <Typography variant="caption">Recent searches</Typography>
    <div>
      {[
        { q: "miles davis", t: "just now" },
        { q: "blue note records", t: "3 min ago" },
        { q: "a love supreme", t: "1h ago" },
        { q: "thelonious monk", t: "2d ago" },
      ].map((row) => (
        <ListItemButton
          key={row.q}
          leading={
            <span className="text-text-muted">
              <ClockGlyph />
            </span>
          }
          trailing={<span className="text-xs text-text-muted">{row.t}</span>}
        >
          <span className="text-sm">{row.q}</span>
        </ListItemButton>
      ))}
    </div>
  </Frame>
);

export const LongTextTruncates: Story = () => (
  <Frame>
    <ListItemButton
      leading={
        <span className="text-text-muted">
          <ClockGlyph />
        </span>
      }
      trailing={<span className="text-xs text-text-muted">5d ago</span>}
    >
      <span className="block truncate text-sm">
        a very long previous search query that should truncate at the available width without
        pushing the trailing timestamp off the row
      </span>
    </ListItemButton>
  </Frame>
);

export const Disabled: Story = () => (
  <Frame>
    <ListItemButton disabled>Disabled row</ListItemButton>
    <ListItemButton
      disabled
      leading={
        <span className="text-text-muted">
          <ClockGlyph />
        </span>
      }
      trailing={<span className="text-xs text-text-muted">—</span>}
    >
      Disabled row with slots
    </ListItemButton>
  </Frame>
);
