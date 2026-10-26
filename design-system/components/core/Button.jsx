import React from "react";

/**
 * Common Space primary action. Square by default; the "circle" variant is the
 * signal-yellow round CTA from the brand. The `>>` chevron always points forward.
 */
export function Button({
  variant = "primary",
  href,
  children,
  chevron = true,
  onClick,
  style = {},
  ...rest
}) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontFamily: "var(--font-mono)",
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: ".06em",
    textTransform: "uppercase",
    textDecoration: "none",
    cursor: "pointer",
    border: "1.5px solid var(--cs-ink)",
    transition: "background .15s, color .15s",
  };

  const variants = {
    primary: { ...base, background: "var(--cs-ink)", color: "var(--cs-on-ink)", padding: "14px 22px" },
    outline: { ...base, background: "transparent", color: "var(--cs-ink)", padding: "13px 22px" },
    circle: {
      ...base,
      border: "none",
      background: "var(--cs-yellow)",
      color: "var(--cs-ink)",
      borderRadius: "var(--radius-pill)",
      width: 108,
      height: 108,
      justifyContent: "center",
      textAlign: "center",
      padding: 0,
    },
    link: {
      ...base,
      border: "none",
      background: "transparent",
      color: "var(--cs-ink)",
      padding: "0 0 3px",
      borderBottom: "2px solid var(--cs-yellow)",
      textTransform: "none",
    },
  };

  const chev = chevron ? (
    <span style={{ color: variant === "primary" ? "var(--cs-yellow)" : "inherit" }}>&gt;&gt;</span>
  ) : null;

  const props = {
    onClick,
    style: { ...variants[variant], ...style },
    ...rest,
  };

  const inner = variant === "circle" ? (
    <span>{children}&nbsp;&gt;&gt;</span>
  ) : (
    <>{children} {chev}</>
  );

  return href ? (
    <a href={href} {...props}>{inner}</a>
  ) : (
    <button type="button" {...props}>{inner}</button>
  );
}
