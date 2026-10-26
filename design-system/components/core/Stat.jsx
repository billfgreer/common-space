import React from "react";

/**
 * Big number stat block — Archivo black numeral over a mono uppercase label.
 * A single accent colors a fragment of the figure (a period, a decimal).
 * Set invert for the ink-surface variant.
 */
export function Stat({ value, label, invert = false, style = {} }) {
  return (
    <div
      style={{
        border: "1px solid var(--cs-line-soft)",
        padding: 26,
        background: invert ? "var(--cs-ink)" : "transparent",
        color: invert ? "var(--cs-on-ink)" : "var(--cs-ink)",
        ...style,
      }}
    >
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 52, lineHeight: 1, letterSpacing: "-.02em" }}>
        {value}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          lineHeight: 1.7,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: invert ? "#B7B7B0" : "var(--cs-mute)",
          marginTop: 12,
        }}
      >
        {label}
      </div>
    </div>
  );
}
