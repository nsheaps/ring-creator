# Test plan

Stack: Vitest (unit and data contract), Playwright (e2e, screenshots, a11y), run in GitHub Actions. Stories: [user-stories.md](stories/user-stories.md). Product rules: [product-spec.md](specs/product-spec.md).

## Pyramid

| Layer         | Tool                                                   | What                                                                                                              | Speed       |
| ------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------- |
| Unit          | Vitest                                                 | Model validation, `stoneMath`, placement clamping, share encode/decode, storage wrapper, history, geometry sanity | seconds     |
| Data contract | Vitest                                                 | Vocabulary ids, every example resolves, related ids, builders registered, controls well-formed                    | seconds     |
| E2E           | Playwright (Chromium; WebKit/Firefox smoke)            | Build flow, save/load, share link, gallery, compare, docs, no-WebGL                                               | minutes     |
| Screenshot    | Playwright against `#/shot/...`                        | Component and example pictures captured in CI, published with the docs site                                       | minutes     |
| Accessibility | Playwright + axe-style checks (optional gate at first) | No serious/critical violations on main routes; keyboard paths                                                     | minutes     |
| Deploy smoke  | Playwright against the deployed URL                    | Key routes load under the Pages base path with no console errors                                                  | under 1 min |

## Unit

- **Model validation:** every model in `src/models/data/` matches its `kind` schema in `src/models/types.ts` (required fields, ranges such as ratings 1..5, `aspectRange` ordered, `defaultAspect` within range, hex colors valid, `defaultColor` in `colors`, unique ids per kind).
- **stoneMath:** `dimsFromCarat` returns finite positive dims; monotonic in carat; denser gems are smaller at equal carat; aspect and depthPct overrides applied; round brilliant 1.00 ct diamond near 6.5 mm (tolerance stated in test); `innerDiameterMm` monotonic and matches published US size table for sizes 3, 7, 13.
- **Geometry sanity** (iterates the builder registry): for every head, shank and band at default params and at min/max of each control, across a representative set of cuts: all position values finite; every `Part` has a valid `PartSlot`; geometry non-empty (vertex count > 0); bounding box within the ring envelope (for example under 40 mm); watertight-ish checks: no degenerate triangles above a small ratio, each shank is a closed loop (first and last cross-sections match within tolerance), and the head's lowest y reaches `-baseDrop`.
- **Placement:** clamping of raise, tilt, offset; orientation changes `bandAxis`.
- **Contour:** `ContourSpec` retreat, half angle and direction; non-capable styles fall back to flush.
- **Share/storage/history:** round trip, size under 2 kB for typical designs, corrupted payloads rejected with a message, blocked storage handled, undo/redo.

## Data contract

- Every id used in `docs/specs/vocabulary.md` sections exists in the models or is flagged as "not yet modelled" in an allow-list (and the list only shrinks).
- Every model id is in the vocabulary (or the vocabulary is updated).
- Every example ring in the gallery data resolves: gem, color, cut, clarity, head, shank, band, metals, finishes; head `fitsCuts` accepts the cut; params within controls' ranges; has name, tags and, when present, a `source.url` that is https.
- `related` ids resolve to existing models.

## E2E (Playwright)

Specs (names used in the story list): `build.spec.ts`, `viewer.spec.ts`, `save.spec.ts`, `gallery.spec.ts`, `components.spec.ts`, `compare.spec.ts`, `docs.spec.ts`, `smoke.spec.ts`, `a11y.spec.ts`, `perf.spec.ts`.

- **Build flow:** open `#/build`, change each step, assert summary text and that the canvas is present; add and remove a band; mixed metals; ring size.
- **Save/load:** save, reload, find in `#/saved`, rename, duplicate, delete with undo; storage blocked via init script.
- **Share link:** click Share, read clipboard (permission granted), open link in a new context, assert same summary; corrupted payload shows banner.
- **Gallery:** open each example (loop over catalogue ids), "Start from this".
- **No WebGL:** launch with WebGL disabled flags, assert fallback image and working spec updates.
- Rendering assertions use the DOM spec summary and `window.__ringReady` hooks, not pixel reads.

## Screenshot tests

`npm run screenshots` drives `#/shot/...` at fixed viewport (800x800), camera, light, seed and with animations off, one PNG per model and per example (Ring and Set views), output under `public/pictures/` (build artifact, not committed). CI fails if any model lacks a picture or a capture throws; pictures are published with the Pages site and used by ComponentCards and the gallery. Optional visual regression: compare key pictures against a baseline with a tolerance and upload diffs as artifacts.

## Accessibility

axe-style checks on `#/`, `#/build`, `#/gallery`, `#/components`, `#/saved`, `#/docs` in both themes; keyboard-only run through the builder (tab order, viewport arrow keys, step tabs); contrast ratios of design tokens computed in a unit test; reduced-motion emulation asserts no auto-rotate. Starts as a warning, becomes a gate once clean.

## Deployment smoke

After deploy, load `#/`, `#/build`, `#/gallery`, `#/components` and one doc under the Pages base path; assert HTTP 200 for assets, no console errors, canvas or fallback present. Failure fails the workflow.

## CI order

typecheck, lint, unit + contract, build, e2e (against `vite preview`), screenshots, a11y, deploy, smoke.

## Traceability

| Story  | Tests                                                    |
| ------ | -------------------------------------------------------- |
| RC-001 | e2e `components.spec.ts`                                 |
| RC-002 | e2e `components.spec.ts`                                 |
| RC-003 | unit `contract.test.ts`; screenshot `component-pictures` |
| RC-004 | e2e `components.spec.ts`                                 |
| RC-005 | screenshot `component-pictures`                          |
| RC-006 | e2e `components.spec.ts`                                 |
| RC-007 | e2e `build.spec.ts`                                      |
| RC-008 | e2e `build.spec.ts`; unit `design-validate.test.ts`      |
| RC-009 | unit `stoneMath.test.ts`; e2e `build.spec.ts`            |
| RC-010 | unit `contract.test.ts`; e2e `build.spec.ts`             |
| RC-011 | e2e `build.spec.ts`; unit `compat.test.ts`               |
| RC-012 | e2e `build.spec.ts`; unit `geometry.test.ts`             |
| RC-013 | e2e `build.spec.ts`; unit `params.test.ts`               |
| RC-014 | e2e `build.spec.ts`; screenshot `mixed-metal`            |
| RC-015 | unit `materials.test.ts`; screenshot `finish-swatches`   |
| RC-016 | unit `placement.test.ts`; e2e `build.spec.ts`            |
| RC-017 | unit `stoneMath.test.ts`; e2e `build.spec.ts`            |
| RC-018 | e2e `build.spec.ts`; screenshot `builder-mobile`         |
| RC-019 | unit `history.test.ts`                                   |
| RC-020 | unit `geometry.test.ts`; e2e `build.spec.ts`             |
| RC-021 | e2e `build.spec.ts`                                      |
| RC-022 | e2e `build.spec.ts`; unit `geometry.test.ts`             |
| RC-023 | e2e `build.spec.ts`; unit `params.test.ts`               |
| RC-024 | unit `contour.test.ts`; screenshot `contour-fit`         |
| RC-025 | unit `contract.test.ts`; screenshot `band-styles`        |
| RC-026 | e2e `viewer.spec.ts`                                     |
| RC-027 | e2e `viewer.spec.ts`                                     |
| RC-028 | e2e `viewer.spec.ts`                                     |
| RC-029 | e2e `perf.spec.ts`                                       |
| RC-030 | e2e `save.spec.ts`; unit `storage.test.ts`               |
| RC-031 | e2e `save.spec.ts`                                       |
| RC-032 | unit `design-validate.test.ts`; e2e `save.spec.ts`       |
| RC-033 | unit `share.test.ts`; e2e `save.spec.ts`                 |
| RC-034 | e2e `compare.spec.ts`; screenshot `compare`              |
| RC-035 | e2e `gallery.spec.ts`; screenshot `gallery`              |
| RC-036 | e2e `gallery.spec.ts`                                    |
| RC-037 | unit `contract.test.ts`                                  |
| RC-038 | e2e `docs.spec.ts`                                       |
| RC-039 | e2e `a11y.spec.ts`                                       |
| RC-040 | unit `models-validate.test.ts`                           |
| RC-041 | unit `geometry.test.ts`                                  |
| RC-042 | unit `geometry.test.ts`                                  |
| RC-043 | screenshot `capture-all`                                 |
| RC-044 | e2e `smoke.spec.ts`                                      |
| RC-045 | e2e `a11y.spec.ts`                                       |
