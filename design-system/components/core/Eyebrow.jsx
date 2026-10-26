import React from "react";

/**
 * Section eyebrow — the `///` mono marker that prefixes headlines.
 * Default magenta; pass color="var(--cs-yellow)" on ink surfaces.
 */
export function Eyebrow({ children, color = "var(--cs-magenta)", style = {} }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        letterSpacing: ".22em",
        textTransform: "uppercase",
        color,
        ...style,
      }}
    >
      /// {children}
    </div>
  );
}
