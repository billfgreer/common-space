# Common Space design language — rules for interactive web work

Applies to any website, web app or interactive prototype built in this repo. Before writing UI, read `design-system/BRAND.md`, `design-system/tokens/*.css` and `design-system/INTERACTION.md`. `reference/Common Space - Design Language.dc.html` is a visual reference only — don't ship it.

## Setup
- Import `design-system/styles.css` (tokens + fonts) and `design-system/base.css` (resets, element defaults, utility devices). Or port the CSS variables into the project's theme (Tailwind config, CSS-in-JS theme). Never hardcode new hexes — use the variables.

## Color
- White #FFFFFF ground · Black #000000 ink · Cyan #00FCFA signal · Magenta #FF1DFF accent/alert · Yellow #FFFF00 highlight. Ratio ≈ 60 white / 25 black / 15 signal.
- Light by default. Full-black surfaces are rare (max one per page/screen).
- Text on cyan, magenta or yellow is ALWAYS black.
- One text accent per block. CMY together only in graphic devices (edge bars, halftone).
- Status mapping: info/live = cyan · error/destructive = magenta · warning/selected/highlight = yellow · success = cyan + check. Never rely on color alone — pair with a label or glyph.

## Type
- Archivo 800–900 UPPERCASE, tight (-0.02em) for display/headings.
- Archivo 400 sentence case for body (16px web default, lh 1.6, max ~68ch).
- Space Mono UPPERCASE, 0.16em tracking for labels, eyebrows, data, buttons, nav, form labels.

## Shape
- `border-radius: 0` everywhere. Only round things: circular yellow CTA, 8px signal dots, radio buttons, avatars.
- Cards/panels: 1px #E2E2E2 border, flat, no shadow. Section dividers: 2–3px black rules.
- Only shadow allowed: floating layers (menus, popovers, modals) — `0 30px 80px -40px rgba(0,0,0,.35)` plus 1px black border.
- No emoji, no exclamation marks, no gradients, no glassmorphism/blur, no icon font. Functional icons: Lucide, 1.5px stroke, 16/20/24px.

## Signature devices
- White dot grid ground: `radial-gradient(#E6E6E6 1.2px, transparent 1.4px) 0 0 / 22px 22px`.
- CMY edge bar: full-bleed strip split cyan / magenta / yellow, 8–16px, on one edge of a hero, panel or footer.
- Logo: `assets/common-space-logo.svg`, top-left, over a 2–3px black rule. White version only over photos.
- `///` eyebrow (Space Mono, magenta on white). `>>` appended to every forward action (`CONTINUE >>`); yellow `>>` in black buttons.
- Numbered sections `01 ——— TITLE`. Stats: Archivo 900 numeral with one colored punctuation mark.
- Registration ticks: L-shaped 2px corner brackets on hero/feature corners.
- Imagery: high-contrast black-and-white breaking into CMYK halftone (`assets/burst-*.png`). Never full-color stock.

## Interaction (full spec in INTERACTION.md)
- Motion feels like print registration: fades + 2–8px translates, 120–240ms, `cubic-bezier(.2,.7,.2,1)`. No bounce, no scale, no spring. Respect `prefers-reduced-motion`.
- Focus: 2px black outline, 2px offset, with yellow fill behind on dark/black elements. Always visible on keyboard focus.
- Selection: yellow bg, black text. Hit targets ≥ 44px.

## Voice
Technical but human; a readout crossed with a manifesto. Short, declarative. Labels uppercase mono. No jargon without grounding.
