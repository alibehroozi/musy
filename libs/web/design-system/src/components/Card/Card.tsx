import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  children: ReactNode;
  /**
   * Optional inset overlay rendered above the children in an absolutely-
   * positioned layer. Used for things like the Explore first-run onboarding
   * panel that floats over the swipe-deck face.
   */
  overlay?: ReactNode;
}

const baseClasses =
  "relative bg-surface border border-border rounded-lg shadow-lg p-4 overflow-hidden";

export function Card({ children, overlay, className, ...rest }: CardProps): JSX.Element {
  const cls = [baseClasses, className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      {children}
      {overlay !== undefined && (
        <div className="absolute inset-0 flex items-center justify-center p-4">{overlay}</div>
      )}
    </div>
  );
}
