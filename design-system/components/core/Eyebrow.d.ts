import * as React from "react";

/** `///` mono section eyebrow. */
export interface EyebrowProps {
  children?: React.ReactNode;
  /** Marker color. Magenta on paper, yellow on ink. */
  color?: string;
  style?: React.CSSProperties;
}
export function Eyebrow(props: EyebrowProps): JSX.Element;
