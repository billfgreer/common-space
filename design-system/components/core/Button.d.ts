import * as React from "react";

/**
 * Primary action button in the Common Space style.
 * @startingPoint section="Core" subtitle="Ink, outline, circle & link CTAs" viewport="700x220"
 */
export interface ButtonProps {
  /** Visual treatment. */
  variant?: "primary" | "outline" | "circle" | "link";
  /** Render as an anchor when set. */
  href?: string;
  /** Show the trailing `>>` chevron (ignored for circle/link). */
  chevron?: boolean;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export function Button(props: ButtonProps): JSX.Element;
