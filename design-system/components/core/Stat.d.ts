import * as React from "react";

/** Big-number stat block. */
export interface StatProps {
  /** The figure — pass JSX to color a fragment (e.g. a magenta period). */
  value?: React.ReactNode;
  label?: React.ReactNode;
  /** Ink-surface variant. */
  invert?: boolean;
  style?: React.CSSProperties;
}
export function Stat(props: StatProps): JSX.Element;
