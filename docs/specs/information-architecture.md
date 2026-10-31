# Information architecture

Hash router (works on GitHub Pages without server rewrites). Base path comes from Vite `base`. Related: [product-spec.md](product-spec.md), [design-system.md](../design/design-system.md), [wireframes](../wireframes/README.md).

## Route map

| Route | Page | Linked in nav |
| --- | --- | --- |
| `#/` | Home | Logo |
| `#/build` | Builder (resumes draft; reads `?d=` share payload) | Build |
| `#/build/:designId` | Builder for a saved design | via Saved |
| `#/gallery` | Example rings | Gallery |
| `#/gallery/:exampleId` | Example detail | via Gallery |
| `#/saved` | Saved designs | Saved |
| `#/components` | Catalogue of kinds | Components |
| `#/components/:kind` | Models of one kind | via Components |
| `#/components/:kind/:id` | Model detail | via list |
| `#/docs` | Docs index | Docs |
| `#/docs/:slug` | One doc | via index |
| `#/compare` | Up to 3 designs side by side (`?ids=a,b,c`) | via Saved |
| `#/shot/...` | Screenshot harness, not linked | no |

Unknown route: 404 page with links to Home and Build. Unknown `:kind`, `:id`, `:exampleId`, `:slug`, `:designId`: scoped not-found message with a back link to the parent list.

Global chrome: top bar (logo, Build, Gallery, Components, Saved, Docs, theme toggle), footer (version, GitHub link, "prices informational"). Mobile: top bar collapses to a menu button; builder uses a bottom sheet for controls.

## State

| State | Where | Lifetime |
| --- | --- | --- |
| Working draft (`Design`) | memory, autosaved to localStorage `ring-creator:draft:v1` | until replaced |
| Saved designs | localStorage `ring-creator:designs:v1` | persistent |
| Shared design | URL hash `?d=` payload | opened as draft, never auto-saved |
| UI prefs (theme, last step, view) | localStorage `ring-creator:prefs:v1` | persistent |
| Catalogue and examples | static data in the bundle | build time |

If localStorage throws, state is memory-only and a one-time toast says so.

## Pages

### Home `#/`
Hero with a live 3D ring (static image without WebGL or under reduced motion), primary "Start designing" button, secondary "See examples". Three tiles: Build, Gallery, Components. Row of 4 featured examples. Empty/error: none (static content). Resume banner if a draft exists.

### Builder `#/build`
- Viewport: 3D scene, view buttons (Ring / Band / Set / Top / Side), reset, fullscreen.
- Step tabs: Stone | Head | Shank | Metals | Band | Fit. Each step shows its controls and the relevant ComponentCards.
- Sticky summary bar: stone (carat, mm), head, shank, metals, size, rough price, and Save / Share / Export / Import; ring-size select.
- Empty: no band yet (Band step shows "Add band"). Error: share payload invalid (banner, default loads); unknown ids (banner listing replaced fields); WebGL missing (static fallback + notice); storage blocked (toast).
- `#/build/:designId`: loads a saved design; missing id shows not-found with link to Saved.

### Gallery `#/gallery`
Filter chips (style, metal, stone, era), grid of example cards (picture, name, tags). Empty filter result: message and "clear filters". `#/gallery/:exampleId`: viewer, spec table, description, source link, "Start from this", "Compare".

### Saved `#/saved`
List of cards (thumbnail, name, updated date, size) with Open, Rename, Duplicate, Delete, Compare checkbox, Import button. Empty: illustration, "No saved designs yet", links to Build and Gallery. Error: corrupt entry is skipped and flagged with an Export raw option.

### Components `#/components`, `/:kind`, `/:kind/:id`
Catalogue: cards per kind. Kind list: search box, tag chips, ComponentCards with RatingDots. Detail: picture/3D, summary, description, SpecTable, pros/cons/best for, See also, "Use in builder". Empty search: message and clear. Unknown id: not-found.

### Docs `#/docs`, `#/docs/:slug`
Sidebar list of docs, rendered Markdown, table of contents for long pages, previous/next links. Not-found for unknown slug.

### Compare `#/compare`
Slots for up to 3 designs (pick from Saved or Gallery), synced 3D views, diff table that highlights differing rows. Empty: three empty slots with "Choose a design". Fewer than 2: hint that comparison needs two.

### Screenshot harness `#/shot/...`
Not linked or indexed (`noindex`). Renders one model or design on a neutral background at a fixed size, fixed camera, no UI chrome, animations off, and sets `window.__shotReady = true` once rendered. Examples: `#/shot/component/head/halo-round`, `#/shot/example/<id>/set`. Used by `npm run screenshots` and the screenshot tests.
