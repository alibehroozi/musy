import type { Story } from "@ladle/react";
import { Icon } from "./Icon.js";

export const Compass: Story = () => <Icon name="compass" />;
export const Heart: Story = () => <Icon name="heart" />;
export const Search: Story = () => <Icon name="search" />;
export const Large: Story = () => <Icon name="compass" size={48} />;
export const Small: Story = () => <Icon name="search" size={16} />;
