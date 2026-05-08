import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "../Icon/Icon.js";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: IconName;
  label: string;
  iconSize?: number;
}

export function IconButton({
  icon,
  label,
  iconSize = 22,
  className,
  type = "button",
  ...rest
}: IconButtonProps): JSX.Element {
  const cls = [
    "inline-flex items-center justify-center rounded-full",
    "size-12",
    "bg-transparent text-text",
    "transition-colors hover:bg-surface",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} aria-label={label} className={cls} {...rest}>
      <Icon name={icon} size={iconSize} aria-hidden />
    </button>
  );
}
