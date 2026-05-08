import { type InputHTMLAttributes, type ReactNode, useId } from "react";
import { X } from "lucide-react";

export type InputVariant = "default" | "search";
export type InputSize = "md" | "lg";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> {
  variant?: InputVariant;
  size?: InputSize;
  /** Leading icon/node rendered inside the input on the left. Not shown when variant="search". */
  prefix?: ReactNode;
  onClear?: () => void;
  label?: string;
}

const sizeClasses: Record<InputSize, { input: string; icon: string }> = {
  md: { input: "px-4 py-2.5 text-md", icon: "size-4" },
  lg: { input: "px-6 py-4 text-lg", icon: "size-5" },
};

const variantStyles: Record<InputVariant, string> = {
  default: [
    "rounded-md",
    "bg-surface border border-border",
    "focus:outline-none focus:border-primary",
  ].join(" "),
  search: "",
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

  if (isSearch) {
    const clearBtn =
      onClear !== undefined && hasValue ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear input"
          className="flex-shrink-0 text-text-muted hover:text-text transition-colors p-1 -mr-1"
        >
          <X className={sz.icon} />
        </button>
      ) : null;

    const containerCls = [
      "w-full flex items-center gap-2",
      size === "lg" ? "px-5 py-6 text-lg" : "px-4 py-4 text-md",
      "rounded-2xl",
      "bg-border border border-transparent",
      "focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20",
      "transition-colors",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div className={containerCls}>
        {label !== undefined && (
          <label htmlFor={id} className="sr-only">
            {label}
          </label>
        )}
        <input
          id={id}
          value={value}
          className="flex-1 min-w-0 bg-transparent outline-none text-text placeholder:text-text-muted font-medium"
          {...rest}
        />
        {clearBtn}
      </div>
    );
  }

  const prefixNode =
    prefix !== undefined ? (
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
    "w-full text-text placeholder:text-text-muted transition-colors",
    variantStyles.default,
    sz.input,
    hasPrefixNode ? (size === "lg" ? "pl-10" : "pl-9") : "",
    clearBtn ? (size === "lg" ? "pr-12" : "pr-9") : "",
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
