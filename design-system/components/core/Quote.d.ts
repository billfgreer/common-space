import * as React from "react";

/** Pull-quote with magenta accent border + mono attribution. */
export interface QuoteProps {
  children?: React.ReactNode;
  /** Attribution line. */
  cite?: React.ReactNode;
  style?: React.CSSProperties;
}
export function Quote(props: QuoteProps): JSX.Element;
