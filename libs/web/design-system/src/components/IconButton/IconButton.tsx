import type { ButtonHTMLAttributes, ReactNode } from "react";

export type IconButtonVariant = "default" | "filled";
export type IconButtonSize = "sm" | "md";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  label: string;
  children: ReactNode;
}

const sizeClasses: Record<IconButtonSize, string> = {
  sm: "size-11 text-sm",
  md: "size-12 text-md",
};

const variantClasses: Record<IconButtonVariant, string> = {
  default:
    "bg-transparent text-text-muted hover:text-text hover:bg-surface border border-transparent",
  filled: "bg-primary text-bg hover:bg-primary-hover border border-transparent",
};

export function IconButton({
  variant = "default",
  size = "md",
  label,
  children,
  className,
  type = "button",
  ...rest
}: IconButtonProps): JSX.Element {
  const cls = [
    "inline-flex items-center justify-center rounded-full",
    "transition-colors duration-[var(--transition-fast)]",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    sizeClasses[size],
    variantClasses[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} aria-label={label} className={cls} {...rest}>
      {children}
    </button>
  );
}
