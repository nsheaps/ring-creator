# Design system

Dark is the default (jewellery reads best on dark); light is the alternative. Theme follows `prefers-color-scheme`, with a manual toggle stored in prefs. Tokens are CSS custom properties on `:root` and `[data-theme="light"]`. Related: [information-architecture.md](../specs/information-architecture.md), [wireframes](../wireframes/README.md).

## Color tokens

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--bg` | `#0e1014` | `#faf8f4` | page |
| `--surface` | `#161a21` | `#ffffff` | cards, panels |
| `--surface-2` | `#1d222b` | `#f1ede4` | inputs, hover, raised |
| `--line` | `#2a303b` | `#d6d0c3` | borders, dividers |
| `--text` | `#ece8df` | `#1c1b19` | body |
| `--muted` | `#9aa0ab` | `#5a5d64` | secondary text |
| `--gold` | `#c9a24b` | `#8a6a1c` | accent, primary button, focus ring |
| `--gold-hover` | `#e0bd68` | `#6e5313` | accent hover/active |
| `--gem-blue` | `#7cc4ff` | `#0b63a3` | links, info, gem highlights |
| `--danger` | `#ff7a7a` | `#b3261e` | errors, destructive |
| `--ok` | `#7be0a4` | `#1b7a46` | success |
| `--on-gold` | `#0e1014` | `#ffffff` | text on gold fills |

Contrast targets (WCAG 2.2 AA): text on `--bg` and `--surface` at least 4.5:1 (body `--text`, `--muted`, `--gold`, `--gem-blue`, `--danger`, `--ok` in both themes); UI boundaries (focus ring, input border, slider track) at least 3:1 against their neighbour. `--line` is decorative and never the only cue for an input boundary; inputs use `--muted` at 60% or the focus ring. Tokens are checked by a unit test that computes ratios.

## Shape, space, depth

- Radius: `--radius: 10px` (controls, chips, cards), `--radius-lg: 16px` (panels, modals, viewport).
- Spacing scale: 4, 8, 12, 16, 24, 32, 48 (`--s-1` to `--s-7`). No other values.
- Borders 1px `--line`. Shadows only on Modal, Toast and popovers (`0 8px 24px rgb(0 0 0 / .35)` dark, `.15` light).

## Typography

- Display (serif): `'Iowan Old Style','Palatino Linotype',Georgia,serif` for page titles and ring names.
- Sans: `system-ui,-apple-system,'Segoe UI',sans-serif` for UI and body. No webfonts.
- Mono (spec values): `ui-monospace,SFMono-Regular,Menlo,monospace`.

| Step | Size / line | Use |
| --- | --- | --- |
| display | 40/48, serif | home hero |
| h1 | 30/38, serif | page title |
| h2 | 22/30, serif | section |
| h3 | 18/26, sans 600 | card title, step title |
| body | 16/24 | text |
| small | 14/20 | secondary, labels |
| caption | 12/16, uppercase tracking .06em | overlines, table heads |

Fluid: display and h1 shrink one step below 600 px. Body never below 16 px on mobile inputs (prevents iOS zoom).

## Layout

- Max content width 1200 px; page gutter 24 px (16 px under 600 px).
- **Builder desktop (at least 900 px):** two columns. Left (60%): 3D viewport with toolbar overlay, sticky. Right (40%): step tabs and controls, scrolls. Sticky summary bar across the bottom of the page.
- **Builder mobile:** viewport on top (45vh), step tabs as a horizontally scrollable row, controls below in a scroll area, summary bar fixed at the bottom with Save/Share/Export in an overflow menu.
- Grids (gallery, components): `repeat(auto-fill, minmax(220px, 1fr))`, gap 16 px.
- Breakpoints: 600 (phone to tablet), 900 (single to two-column builder), 1200 (wide).

## Component inventory

| Component | Notes |
| --- | --- |
| Button | primary (gold fill, `--on-gold`), secondary (surface-2 + line), ghost, danger; icon-only needs `aria-label`; min 44 px height on touch |
| Chip | toggle filter or tag; `aria-pressed` when toggleable |
| Swatch | color or metal sample (circle, 32 px, ring on selected); label always present as text or `aria-label` |
| Slider | native `input[type=range]` styled, with number input twin, unit, min/max, reset; arrow/PageUp/PageDown keys |
| Select | native `select` styled; used for ring size, material |
| Segmented | 2 to 5 exclusive options (`radiogroup`), e.g. orientation, fit |
| Card | surface, line, radius 16; optional header/footer |
| Tabs | step tabs (`tablist`), arrow keys move, Home/End jump; mobile scrolls |
| Modal | focus trap, Escape closes, returns focus, backdrop `rgb(0 0 0 / .6)` |
| Toast | bottom-center, live region `role="status"`, 5 s auto dismiss (not while hovered/focused), optional action (Undo) |
| Viewer toolbar | view buttons Ring / Band / Set / Top / Side (Segmented), Reset, Fullscreen; overlay on viewport, top-left |
| SpecTable | two-column key/value, caption row, mono values, units in muted |
| ComponentCard | picture (1:1), name, summary (2 lines), tag chips, RatingDots, "Use in builder" |
| RatingDots | 5 dots, filled count = rating, `role="img"` with `aria-label="Durability 4 of 5"` |
| Banner | inline info/warn/error with icon and text, dismissible |
| EmptyState | icon, one sentence, one or two actions |

## States

Every interactive element defines: default, hover (surface-2 or `--gold-hover`), focus-visible (2px `--gold` ring with 2px offset, 3:1 against neighbours), active (translateY 1px or darker fill), disabled (50% opacity, `aria-disabled`, reason in tooltip or helper text, never color alone), loading (spinner with text, `aria-busy`), error (`--danger` border + icon + message linked by `aria-describedby`), selected (gold ring/underline plus `aria-selected`/`aria-pressed`/`aria-checked`).

## Motion

- Durations 120 ms (hover), 200 ms (panels, toasts), 400 ms (camera view changes). Easing `cubic-bezier(.2,.8,.2,1)`.
- `prefers-reduced-motion: reduce`: no auto-rotate, no camera tweening (jump), no slide/fade (instant), spinners become static text.
- The 3D scene never rotates on its own after the first 3 s hero on Home, and never when reduced motion is set.

## Accessibility rules

1. Contrast per the table above, both themes; no information by color alone.
2. All functions available by keyboard; visible focus; logical tab order; no keyboard traps except Modal (with Escape).
3. Viewport is focusable (`role="application"` avoided; use `role="img"` plus keyboard handlers with a generated text description of the ring and instructions in `aria-describedby`).
4. Every form control has a visible label; help text via `aria-describedby`; errors announced.
5. Touch targets at least 44x44 px; pinch and two-finger pan work in the viewport; page scroll is not trapped by the viewport on mobile (one-finger scroll on the controls, orbit on the viewport only).
6. Live updates (toasts, price changes) use `aria-live="polite"`.
7. Language set (`lang="en"`), headings in order, landmarks (`header`, `nav`, `main`, `footer`).
8. Zoom to 200% and 320 px width without horizontal scroll.
9. Images have alt text; decorative images `alt=""`; component pictures alt = "<name> shown in <metal>".
