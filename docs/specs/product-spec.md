# Ring Creator: product spec

Status: draft v0.1. Vocabulary ids: [vocabulary.md](vocabulary.md).

## 1. Vision

Ring Creator is a static web app (GitHub Pages SPA) for designing an engagement ring and a matching wedding band in 3D. Every choice (metal, gem, cut, head, shank, band style) is a plain data model, so the catalogue grows by adding data, not code. Users get a realistic preview, honest trade-off information (durability, upkeep, rough price), and a design they can save, share by link and hand to a jeweler.

Principles: data-driven models; honest information over upsell; everything runs in the browser with no account or server; shareable by URL.

## 2. Personas

| Persona | Goal | Needs |
| --- | --- | --- |
| **Engaged couple** (Sam and Alex, first-time buyers) | Settle on a ring they both like, within a budget range | Guided steps, plain-language explanations, both rings side by side, size and carat in real mm, a share link to send family |
| **Jeweler / designer** | Show a client a concept before CAD or casting | Precise parameters (raise, tilt, offset, widths), mixed metals, JSON export, stable permalinks, a clean screenshot |
| **Curious browser** | Explore styles, learn terms | Gallery of examples, component catalogue with descriptions, no sign-up, works on a phone |

## 3. Scope

### v0.1 demo (P0)

- Builder: stone (material, color, cut, carat, clarity), head, shank, metals per part, finish, placement (orientation, raise, tilt, offset), ring size.
- Wedding band: style, metal(s), width, thickness, fit (auto/flush/contour).
- 3D viewport with Ring / Band / Set / Top / Side views, orbit, zoom, reset.
- Spec summary (size in mm, carat, metals, rough price range).
- Save to localStorage, export/import JSON, share URL in the hash.
- Gallery of example rings from the data catalogue (see `data/` and the research notes).
- Component catalogue pages with pictures generated in CI.
- Docs pages rendered from `docs/`.
- Static fallback images when WebGL is unavailable.

### Later (P1/P2)

- Compare up to 3 designs side by side.
- Per-stone accent editing, engraving text, custom finish mixes.
- Quote-style cost estimate with editable metal prices.
- Print/PDF spec sheet, glTF/STL export for CAD hand-off.
- Ring-on-hand AR/overlay preview, localisation, user-supplied models via JSON import.

## 4. Feature list

1. Step-based builder: Stone, Head, Shank, Metals, Band, Fit.
2. Live 3D preview with view presets and orbit/zoom/pan.
3. Mixed metals per part (head, shank, band, band second metal).
4. Stone sizing by carat, converted to mm (section 6).
5. Placement controls: orientation, raise, tilt, rotate, offset.
6. Contour band fitting around the engagement head.
7. Ring size (US 3 to 13, half sizes) with inner diameter in mm.
8. Spec table and rough price range with the "informational only" notice.
9. Saved designs list (rename, duplicate, delete).
10. Export/import JSON; share link.
11. Gallery with "open in builder" and "start from this".
12. Component catalogue with filters, detail pages, related models.
13. Compare view.
14. Docs viewer with an "adding a model" guide.
15. Light and dark themes (system default, manual toggle).

## 5. Non-goals

- No checkout, quoting, ordering or jeweler marketplace; prices are informational.
- No accounts, backend or analytics that identifies people.
- No gemological certification claims; clarity/color are visual approximations.
- No photoreal path tracing; real-time WebGL only.
- No CAD-grade manufacturing output in v0.1 (the geometry is for preview).

## 6. Data model summary

Source of truth: `src/models/types.ts`.

- **Models** (`Model` union, discriminated by `kind`): `metal`, `finish`, `gem`, `clarity`, `color-grade`, `cut`, `head`, `shank`, `band`. Each extends `ModelBase` (id, name, summary, description, tags, pros, cons, bestFor, related). Head, shank and band models carry `builder`, default `params` and UI `controls` (number, select, toggle).
- **Design** (saved JSON, `version: 1`): `id`, `name`, `notes`, `createdAt`, `updatedAt`, `ringSizeUS`, `engagement`, `band | null`, optional `source`, `tags`.
  - `engagement`: `center` (StoneSpec: material, color, cut, carat, clarity, colorGrade, aspect, depthPct), `accentStone`, `head {id, metal, params}`, `shank {id, metal, params}`, `placement` (orientation, raise, tilt, rotate, offset), `finish`.
  - `band` (BandSpec): `style`, `metal`, `metal2`, `finish`, `params`, `widthMm`, `thicknessMm`, `accentStone`, `fit`.
- All ids come from [vocabulary.md](vocabulary.md); ids are never renamed silently.
- Geometry: builders in `src/geometry` return `Part[]` assigned to a `PartSlot` (center-stone, accent-stone, head-metal, shank-metal, band-metal, band-metal2, band-stone), so each slot maps to one material and metals can mix per part. Coordinate frames are documented in `src/geometry/types.ts` (millimetres; finger axis +Z, top of ring +Y).

## 7. Key rules

1. **Mixed metals per part.** Head, shank, band and band second metal are independent choices. Accent stones follow their host part. Defaults: head and shank share a metal; the band matches the shank unless changed. A mixed-metal design shows a note about wear and matching (informational).
2. **Stone size by carat.** `dimsFromCarat(cut, gem, {carat, aspect, depthPct})` in `src/models/stoneMath.ts` converts carat to length, width and depth in mm using `ct = volumeFactor * L * W * D * (SG / 3.52)`, so a 1 ct moissanite and a 1 ct diamond differ in mm. The UI always shows mm beside carat.
3. **Placement.** `orientation` north-south or east-west; `raise` is mm from shank top to culet and is clamped to a safe minimum so heads join the shank (`baseDrop > 0`); `tilt` in degrees (+ toward fingertip); `rotate` about the stone's vertical axis; `offset` in mm along the band for bypass/asymmetric looks. Values outside control ranges are clamped, never thrown.
4. **Contour band fitting.** With `fit: 'auto'`, a band whose style has `contourCapable: true` bends around the head (retreat, half angle, direction in `ContourSpec`); other styles sit flush and the UI says why. `contour` forces it where possible; `flush` never bends. Band inner radius equals the engagement ring's.
5. **Ring size.** US sizes 3 to 13 in half steps; `innerDiameterMm(sizeUS)` gives the inner diameter used by all builders. Default 6.5. Band and engagement ring always share the size.
6. **Compatibility.** Heads declare `fitsCuts`; incompatible choices are disabled with a reason, and loading a design with an incompatible pair falls back to the head's first fitting cut and shows a warning.
7. **Graceful loading.** Unknown ids in imported or shared designs are reported per field, replaced by defaults and listed in a dismissible banner.

## 8. Save and share

- **localStorage:** key `ring-creator:designs:v1` holds an array of designs; autosave of the working draft under `ring-creator:draft:v1`. Every access is wrapped in try/catch; without storage the app works and warns that nothing will persist.
- **Export/import JSON:** a single `Design` or an array, validated against the schema on import (version, ids in the vocabulary, numeric ranges). Files are `<slug>.ring.json`.
- **Share URL:** `#/build?d=<payload>` where the payload is the design JSON, minified (defaults omitted), deflate-compressed and base64url encoded. Target under 2 kB for a typical design. Opening a link never overwrites saved designs; it opens as an unsaved draft with "Save a copy".
- Example rings are addressed by id (`#/gallery/:exampleId`) and need no payload.

## 9. Accessibility and performance budgets

| Area | Budget |
| --- | --- |
| Time to interactive 3D scene | under 3 s on a mid laptop (4-core, integrated GPU, cable connection), first visit |
| Rebuild after a control change | under 150 ms for the ring, with debounced slider updates |
| Frame rate | 60 fps idle orbit, 30 fps minimum with Set view on integrated GPU |
| JS payload | under 600 kB gzipped initial, 3D chunk loaded on `#/build` and viewer routes only |
| No WebGL | static fallback images per example and component, a clear message, controls and spec table still work |
| Keyboard | every control operable by keyboard; viewport has arrow-key orbit, +/- zoom, `R` reset, visible focus |
| Contrast | WCAG 2.2 AA in both themes (4.5:1 text, 3:1 UI and focus ring) |
| Motion | respects `prefers-reduced-motion` (no auto-rotate, no animated transitions) |
| Screen readers | viewport has a text alternative generated from the spec; form controls labelled; toasts in a live region |
| Touch | targets at least 44 px; builder usable at 390 px width |

See [design-system.md](../design/design-system.md) and [test-plan.md](../test-plan.md).
