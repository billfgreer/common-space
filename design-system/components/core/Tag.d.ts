import * as React from "react";

/** Impact tag chip with a colored signal dot. */
export interface TagProps {
  children?: React.ReactNode;
  /** Signal-dot color (CSS value). */
  dot?: string;
  /** Ink-filled variant. */
  invert?: boolean;
  style?: React.CSSProperties;
}
export function Tag(props: TagProps): JSX.Element;
