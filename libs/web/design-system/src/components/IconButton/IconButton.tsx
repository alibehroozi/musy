import type { ButtonHTMLAttributes, ReactNode } from "react";

export type IconButtonVariant = "default" | "filled";
export type IconButtonSize = "sm" | "md";

const baseClasses =
  "inline-flex items-center justify-center rounded-full transition-colors " +
  "disabled:opacity-50 disabled:cursor-not-allowed " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-primary";

const variantClasses: Record<IconButtonVariant, string> = {
  default: "text-text-muted hover:text-text hover:bg-border",
  filled: "bg-primary text-bg hover:bg-primary-hover",
};

// 44×44 minimum touch target (BROWSER guideline). md adds visual breathing room.
const sizeClasses: Record<IconButtonSize, string> = {
  sm: "size-11",
  md: "size-12",
};

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Required — labels the button for screen readers. */
  "aria-label": string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  children: ReactNode;
}

export function IconButton({
  variant = "default",
  size = "sm",
  className,
  children,
  type = "button",
  ...rest
}: IconButtonProps): JSX.Element {
  const cls = [baseClasses, variantClasses[variant], sizeClasses[size], className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={cls} {...rest}>
      {children}
    </button>
  );
}
