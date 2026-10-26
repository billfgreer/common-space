# Common Space — Design System

> The visual system for a humanitarian satellite mission. *Built in the open, signaled in CMYK.*
>
> **Light by default.** White ground, black as ink, fluorescent CMYK as signal.

## Company context

**Common Space Inc.** is a 501(c)(3) non-profit (Denver, CO · St. Louis, MO) building **the first Earth-observation satellite owned by the people it serves** — community-governed, non-commercial, neutral by design. The brand exists to make a technical, geopolitical mission feel **open, urgent, and human**.

The identity is a print-shop metaphor: the **CMYK process plates** carry the whole system, printed on white. White and black do the everyday work; Cyan, Magenta, and Yellow are *signal* — bright, saturated, and unafraid, in bars, halftone, and highlight.

**Surfaces are light.** White is the default ground for nearly everything — posts, decks, documents, UI. Black is **ink, not background**: reserve full-black surfaces for rare, deliberate moments (a single dramatic cover, a photo scrim), never as the house style. When a surface needs energy, reach for a **saturated CMY ground** (yellow or cyan) before reaching for black.

### Brand values (from the deck)
1. **Human Agency** — communities know what serves them; build local capacity, not dependency.
2. **Independence** — neutral by design; free from political, military, or commercial control.
3. **Transparency** — open imagery, licensing, and tasking; clear documentation.
4. **Optimistic Curiosity** — better futures through experimentation; technology can advance equity.
5. **Stewardship** — servant leadership and shared decision-making; redistribute power, minimize harm.

### Sources used to build this system
- `Common Space - Design Language.dc.html` — the canonical brand reference (logo, color, type, imagery, UI).
- `Common Space - Budget Board Deck.dc.html`, `Common Space - Program Budget.dc.html` — live decks (tone, layout, data treatment).
- `assets/logo.png` — primary lockup.
- `uploads/` — values screenshots + source logos + program budget xlsx.

---

## CONTENT FUNDAMENTALS

**Voice:** technical but human — a *readout from the satellite* crossed with a movement manifesto. Confident, plain, never corporate-soft.

- **Casing:** display + headlines run **UPPERCASE**, tight tracking. Labels, captions, and data run **uppercase mono** with wide tracking (`.16em`). Body is sentence case.
- **Person:** "we" for the org, "the community" / "the people it serves" for beneficiaries. Avoids charity framing ("Fairness is designed into systems, not delivered as charity").
- **The `>>` motif:** double chevron means *forward — to the next step, the next orbit*. Appended to links and CTAs (`READ THE MISSION BRIEF >>`, `JOIN US >>`). Often boxed: black chip with white text, or a yellow chip with black text.
- **The `///` motif:** triple slash prefixes eyebrows/section markers, set in magenta or yellow mono (`/// What we're building`).
- **Sentences:** short, declarative, often fragmentary for rhythm. "Neutral by design." "Built in the open." "In the open."
- **Numbers/data:** mono, with a single colored accent punctuating a stat (`75.` with magenta period; `0.3M` with yellow decimal).
- **No emoji.** No exclamation. No jargon without grounding.

---

## VISUAL FOUNDATIONS

**Overall feel:** a bright risograph / process-print broadsheet. Clean white stock, hard black ink, hard square corners, and confident hits of fluorescent CMYK.

- **Color:** `≈ 60 white · 25 black · 15 signal` — lighter and poppier than a typical print system. Brand hexes only: **#FFFFFF · #000000 · #00FCFA cyan (signal) · #FF1DFF magenta (alert/accent) · #FFFF00 yellow (highlight)**. Yellow is the dedicated UI highlight, cyan the live signal, magenta the accent. Because all three CMY plates are near-fluorescent, **text on them is always black** — never white. In text, use **one** accent at a time; in graphic devices (edge bars, halftone bursts) all three may run together.
- **Ground selection:** white first. Then a **full-saturation CMY ground** (yellow or cyan with black type) for statement pieces. Black grounds are the exception, not the rule.
- **Type:** two voices — **Archivo** (heavy grotesque, 800–900 for display, uppercase, tight) + **Space Mono** (labels, data, captions, the `>>`/`///` motifs). See `tokens/typography.css`.
- **Corners:** **square** everywhere (`--radius: 0`). The only curves are the circular CTA and the round signal dots.
- **Borders:** hairline `1px` (`--cs-line-soft`) frames cards; `2px`–`3px` black rules separate major sections; `4px`–`6px` accent border (magenta or cyan) on quotes and callouts. Cards are **bordered, not shadowed** — flat on white.
- **Shadows:** essentially none on internal UI. The only shadow in the system is the document drop-shadow lifting the whole sheet off the page (`0 30px 80px -40px rgba(0,0,0,.35)`).
- **Backgrounds:** white, with light-gray texture. Texture is earned, not loud — faint dot grids (`radial-gradient` 18–26px in `#E6E6E6`), light engineering grids, and **CMYK halftone bursts** (overlaid radial-gradient dot screens masked into a circle, at high coverage so they read bright, not washed).
- **CMY edge bars:** the signature graphic device — a full-bleed strip of solid cyan / magenta / yellow split in thirds along one edge, sitting **in front of** any halftone. Use on the right edge of landscape posts, the bottom of squares, the left of photos.
- **Imagery:** the signature treatment is **high-contrast black-and-white photography/line-art fracturing into a CMYK halftone spray** — the world in monochrome until the signal turns it to color. Photos are the one place large dark areas belong; pair them with a white type panel or a white footer lockup rather than bleeding dark across the whole composition. Never full-color stock.
- **Logo:** the lockup is a primary compositional element, not a trailing credit — set it large (55–85px on a 1200px canvas), top-left, above a `2px`–`3px` black rule. Use the black lockup on white and CMY grounds; the knockout only over photos.
- **Layout:** broadsheet grid, generous `64px` section padding, numbered sections (`01`–`05`) with a mono label, a hairline, and a number. Content sits on a max ~1180px sheet.
- **Animation:** restrained. Fades and short transl\u00admoves only — nothing bouncy. The brand reads as *printed*, so motion should feel like registration, not bounce.
- **Hover/press:** primary (ink) buttons lighten/raise the chevron to yellow on hover; ghost/outline fill ink on hover; links thicken the yellow underline. Press = slight darken, no shrink.
- **Transparency/blur:** avoid glassmorphism entirely. Opacity is used only to dial back background textures (`.5–.7`).

---

## ICONOGRAPHY

Common Space is **icon-light by design**. The brand leans on *typographic and geometric marks* rather than a drawn icon set:

- **The `>>` and `///` glyphs** are the primary "icons" — typed in Space Mono, never drawn.
- **Signal dots:** small filled circles (8px) in cyan/magenta/yellow act as category bullets on tags.
- **Registration ticks:** L-shaped corner brackets (two 2px borders) mark cover corners — a print-registration cue.
- **The mark itself** (orbit + offset nodes + one cyan signal dot) is the only illustrative element; `assets/logo.png`.
- **No emoji. No icon font.** If a functional UI ever needs line icons (settings, nav), use **Lucide** (CDN) at `1.5px` stroke to match the hairline system, and flag it — it is a substitution, not an existing brand asset.

---

## INDEX / MANIFEST

- `styles.css` — global entry (import this). Pulls in `tokens/{fonts,colors,typography,spacing}.css`.
- `tokens/` — color, type, spacing, font custom properties.
- `cards/` — foundation specimen cards (Colors, Type, Spacing, Brand) shown in the Design System tab.
- `components/core/` — reusable React primitives: `Button`, `Tag`, `Stat`, `Eyebrow`, `Quote`.
- `slides/` — sample 16:9 slides in the brand style (title, statement, values, stat, quote).
- `assets/` — logo files. **SVG is the primary format** (scalable, editable, tiny):
  - `common-space-logo.svg` — full lockup, black + cyan. Use on white and CMY grounds.
  - `common-space-logo-white.svg` — full lockup, white + cyan. Over photos and dark grounds only.
  - `common-space-mark.svg` — mark only, black + cyan. Avatars, favicons, tight spaces.
  - `common-space-mark-white.svg` — mark only, white + cyan.
  - `logo.png` — legacy raster lockup (still referenced by some designs).

  The SVGs are true vector traces of the supplied artwork: two paths each (ink + `#00FCFA` dot), `fill-rule="evenodd"`, no clipping masks. Recolor the ink by editing the first path's `fill`. The cyan dot should stay `#00FCFA` in all cases.
- `Common Space - Design Language.dc.html` — the full narrative brand reference (keep as the canonical doc).
- `SKILL.md` — makes this folder usable as a downloadable Agent Skill.

> **Share note:** set this file's type to **Design System** in the Share menu so others in your org can view it.
