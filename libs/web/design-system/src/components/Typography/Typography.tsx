import type { ReactNode } from "react";

export type TypographyVariant = "h1" | "h2" | "h3" | "body" | "caption";

const variantClasses: Record<TypographyVariant, string> = {
  h1: "text-3xl font-bold leading-tight text-text",
  h2: "text-2xl font-semibold leading-tight text-text",
  h3: "text-xl font-semibold leading-tight text-text",
  body: "text-md font-regular leading-normal text-text",
  caption: "text-sm font-regular leading-normal text-text-muted",
};

const defaultTag: Record<TypographyVariant, "h1" | "h2" | "h3" | "p" | "span"> = {
  h1: "h1",
  h2: "h2",
  h3: "h3",
  body: "p",
  caption: "span",
};

export interface TypographyProps {
  variant?: TypographyVariant;
  className?: string;
  children: ReactNode;
}

export function Typography({
  variant = "body",
  className,
  children,
}: TypographyProps): JSX.Element {
  const Tag = defaultTag[variant];
  const cls = className ? `${variantClasses[variant]} ${className}` : variantClasses[variant];
  return <Tag className={cls}>{children}</Tag>;
}
