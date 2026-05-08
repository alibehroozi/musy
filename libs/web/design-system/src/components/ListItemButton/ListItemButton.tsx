import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface ListItemButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  /** Optional content rendered on the left of the row (icon, avatar). */
  leading?: ReactNode;
  /** Optional content rendered on the right of the row (timestamp, badge, count). */
  trailing?: ReactNode;
  /** Main content; takes the available horizontal space between leading and trailing. */
  children: ReactNode;
}

const baseClasses =
  "flex items-center gap-3 px-4 py-3 w-full text-left text-text " +
  "transition-colors hover:bg-surface/50 " +
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-primary";

export function ListItemButton({
  leading,
  trailing,
  children,
  className,
  type = "button",
  ...rest
}: ListItemButtonProps): JSX.Element {
  const cls = [baseClasses, className].filter(Boolean).join(" ");
  return (
    <button type={type} className={cls} {...rest}>
      {leading !== undefined && <span className="shrink-0">{leading}</span>}
      <span className="flex-1 min-w-0">{children}</span>
      {trailing !== undefined && <span className="shrink-0">{trailing}</span>}
    </button>
  );
}
