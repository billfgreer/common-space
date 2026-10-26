import React from "react";

/**
 * Pull-quote — heavy body quote with a magenta accent left border and a mono
 * attribution line. The signature testimonial treatment.
 */
export function Quote({ children, cite, style = {} }) {
  return (
    <figure
      style={{
        margin: 0,
        border: "1px solid var(--cs-line-soft)",
        borderLeft: "4px solid var(--cs-magenta)",
        padding: "34px 32px",
        background: "var(--cs-paper)",
        ...style,
      }}
    >
      <blockquote
        style={{
          margin: 0,
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 24,
          lineHeight: 1.28,
          letterSpacing: "-.01em",
          color: "var(--cs-ink)",
        }}
      >
        “{children}”
      </blockquote>
      {cite && (
        <figcaption
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            letterSpacing: ".08em",
            textTransform: "uppercase",
            color: "var(--cs-mute)",
            marginTop: 22,
          }}
        >
          — {cite}
        </figcaption>
      )}
    </figure>
  );
}
