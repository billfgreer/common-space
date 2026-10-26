import React from "react";

/**
 * Impact tag — a mono, uppercase, square-bordered chip with a colored signal dot.
 * Used for program areas (Disasters, Food security, Conflict mapping…).
 */
export function Tag({ children, dot = "var(--cs-magenta)", invert = false, style = {} }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        letterSpacing: ".06em",
        textTransform: "uppercase",
        padding: "8px 14px",
        border: "1px solid var(--cs-ink)",
        background: invert ? "var(--cs-ink)" : "transparent",
        color: invert ? "var(--cs-on-ink)" : "var(--cs-ink)",
        ...style,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot, flex: "none" }} />
      {children}
    </span>
  );
}
