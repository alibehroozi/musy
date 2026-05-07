import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const baseClasses =
  "inline-flex items-center justify-center font-medium transition-colors " +
  "disabled:opacity-50 disabled:cursor-not-allowed " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-primary";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary text-bg hover:bg-primary-hover",
  secondary: "bg-surface text-text border border-border hover:bg-border",
  ghost: "bg-transparent text-text hover:bg-surface",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-2 py-1 text-sm rounded-sm gap-1",
  md: "px-4 py-2 text-md rounded-md gap-2",
  lg: "px-6 py-3 text-lg rounded-md gap-2",
};

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps): JSX.Element {
  const cls = [baseClasses, variantClasses[variant], sizeClasses[size], className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={cls} {...rest}>
      {children}
    </button>
  );
}
