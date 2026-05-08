import { type InputHTMLAttributes, type ReactNode, useId } from "react";
import { Search, X } from "lucide-react";

export type InputVariant = "default" | "search";
export type InputSize = "md" | "lg";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> {
  variant?: InputVariant;
  size?: InputSize;
  /** Leading icon/node rendered inside the input on the left. Ignored when variant="search" (search icon is always shown). */
  prefix?: ReactNode;
  onClear?: () => void;
  label?: string;
}

const sizeClasses: Record<InputSize, { input: string; icon: string }> = {
  md: { input: "px-3 py-2 text-md", icon: "size-4" },
  lg: { input: "px-4 py-3 text-lg", icon: "size-5" },
};

const variantBase: Record<InputVariant, string> = {
  default: "rounded-md",
  search: "rounded-full",
};

export function Input({
  variant = "default",
  size = "md",
  prefix,
  onClear,
  label,
  className,
  value,
  id: idProp,
  ...rest
}: InputProps): JSX.Element {
  const generatedId = useId();
  const id = idProp ?? generatedId;

  const isSearch = variant === "search";
  const hasValue = value !== undefined && value !== "";
  const sz = sizeClasses[size];

  const prefixNode = isSearch ? (
    <span
      aria-hidden
      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
    >
      <Search className={sz.icon} />
    </span>
  ) : prefix !== undefined ? (
    <span
      aria-hidden
      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
    >
      {prefix}
    </span>
  ) : null;

  const hasPrefixNode = prefixNode !== null;

  const clearBtn =
    onClear !== undefined && hasValue ? (
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear input"
        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors"
      >
        <X className={sz.icon} />
      </button>
    ) : null;

  const inputCls = [
    "w-full bg-surface text-text placeholder:text-text-muted",
    "border border-border focus:outline-none focus:border-primary",
    "transition-colors",
    variantBase[variant],
    sz.input,
    hasPrefixNode ? (size === "lg" ? "pl-10" : "pl-9") : "",
    clearBtn ? (size === "lg" ? "pr-10" : "pr-9") : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="relative w-full">
      {label !== undefined && (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      )}
      {prefixNode}
      <input id={id} value={value} className={inputCls} {...rest} />
      {clearBtn}
    </div>
  );
}
