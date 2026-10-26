# Interaction spec — Common Space

Rules for interactive states and UI patterns. Values reference tokens in `tokens/*.css`.

## Motion
- Durations: `--dur-fast 120ms` (hover, press) · `--dur-base 180ms` (menus, tabs, toasts) · `--dur-slow 240ms` (modals, drawers, page sections).
- Easing: `--ease-out cubic-bezier(.2,.7,.2,1)`; exits use `ease-in` at 80% duration.
- Allowed: opacity, translate (2–8px; drawers full width), color, border-color, underline thickness. Not allowed: scale, rotate, bounce, blur.
- Scroll reveals: fade + 8px rise, once, staggered 40ms max. Off under `prefers-reduced-motion`.

## State matrix
| Element | Rest | Hover | Active/press | Focus-visible | Disabled |
|---|---|---|---|---|---|
| Primary button | black bg, white text, yellow `>>` | `>>` shifts 3px right | bg #1A1A1A | 2px black outline, 2px offset, yellow ring | bg #D4D4D4, text #666, no `>>` |
| Outline button | 1.5px black border | black bg, white text | bg #1A1A1A | as above | border #D4D4D4, text #999 |
| Yellow / circle CTA | yellow bg, black text | black 1.5px border appears | yellow darkened (#E6E600) | as above | — |
| Text link | black, 2px yellow underline | underline 4px | text #333 | outline as above | #999, no underline |
| Card (clickable) | 1px #E2E2E2 | border black, title `>>` appears | bg #F2F2F2 | outline as above | opacity .5 |
| Nav item | mono 12px #000 | yellow 3px underline | — | outline | — |
| Nav item (current) | 3px black underline | — | — | — | — |

## Forms
- Label: Space Mono 11px uppercase 0.16em, above the field, 8px gap.
- Input: 48px tall, 1.5px black border, square, white bg, Archivo 16px, 0 14px padding. Placeholder #999.
- Focus: border stays black, 3px yellow inset box-shadow under the bottom edge (`inset 0 -3px 0 #FFFF00`).
- Error: 1.5px magenta border; message below in Space Mono 11px black, prefixed with a magenta `■`. Validate on blur, re-validate on input once errored.
- Help text: Archivo 13px #666.
- Checkbox: 20px square, 1.5px black border; checked = black fill, white check. Radio: 20px circle, checked = black dot. Toggle: 44×24 square track, black when on, yellow knob.
- Select / combobox: input style + `▾` mono glyph; menu = floating layer.

## Floating layers (menus, popovers, tooltips)
- White bg, 1px black border, shadow `0 30px 80px -40px rgba(0,0,0,.35)`, no radius.
- Menu items 40px, mono 12px uppercase; hover = yellow bg.
- Tooltip: black bg, white Space Mono 11px, 6×10 padding, 400ms delay.

## Modals & drawers
- Scrim: rgba(0,0,0,.55), no blur. Modal: white, 2px black border, max 640px, 32px padding, CMY edge bar along top (8px). Title Archivo 800 uppercase 24px. Close = `×` mono button top-right, 44px.
- Drawer: slides from right, 240ms, 3px black left rule.
- Trap focus, close on Esc and scrim click, return focus on close.

## Feedback
- Toast: bottom-left, white, 1px black border, 4px left bar in status color, mono label + Archivo message. Auto-dismiss 5s; pause on hover.
- Inline banner: full-width, status-color bg (cyan/yellow/magenta) with black text, mono label `/// NOTICE`.
- Loading: mono `LOADING >>>` with chevrons stepping in sequence, or a 2px black indeterminate bar at top of the region. Skeletons: #F2F2F2 blocks, no shimmer (static pulse of opacity .6–1 at most).
- Empty state: dot-grid panel, mono eyebrow, one heavy line, one action.
- Progress / steps: numbered `01 02 03` mono; current = black chip with white text, done = cyan dot.

## Navigation
- Header: logo left, mono nav right, primary CTA far right, 2px black rule beneath. Sticky headers gain a 1px #E2E2E2 bottom border on scroll (no shadow).
- Mobile (< 768px): nav collapses to `MENU` mono button; full-screen white overlay, items Archivo 900 uppercase 36px, CMY bar on the left edge.
- Tabs: mono uppercase, 3px black underline on active, yellow on hover.
- Breadcrumbs: mono 11px, separated by `/`.

## Data
- Tables: mono header row 11px uppercase on #F2F2F2, 2px black rule under header, 1px #EFEFEF row lines, numbers right-aligned in Space Mono. Row hover #F2F2F2; selected row yellow.
- Charts: black for primary series, then cyan, magenta, yellow (yellow only on white with black outline). Gridlines #EFEFEF. Labels Space Mono.

## Layout & responsive
- Breakpoints: 480 / 768 / 1024 / 1280. Max content 1180px, gutters 24px (16px mobile).
- 12-column grid desktop, 4 columns mobile. Section padding 64px desktop, 40px tablet, 32px mobile.
- Display type uses `clamp()` (see `base.css`).

## Accessibility
- Contrast: black on all CMY plates passes; never white on CMY; never cyan/yellow text on white.
- Keyboard: every interactive element reachable and visibly focused.
- Hit targets ≥ 44×44px. Motion off under `prefers-reduced-motion: reduce`.
