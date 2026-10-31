# User stories

Priority: **P0** demo (v0.1), **P1** soon after, **P2** later. Test kinds: unit, e2e (Playwright), screenshot (CI-captured, published in docs). Traceability to test files is in [test-plan.md](../test-plan.md). Product context: [product-spec.md](../specs/product-spec.md).

## Epic A: Browse components

### RC-001 Browse the catalogue (P0)

As a curious browser I want to see all component kinds so that I know what I can choose from.

- Given I open `#/components`, when the page loads, then I see one card per kind (metal, gem, cut, head, shank, band, finish, clarity, color-grade) with a count.
- Given I click a kind, when `#/components/:kind` opens, then I see a ComponentCard per model.

Test: e2e `components.spec.ts` (catalogue lists every kind).

### RC-002 Filter and search components (P1)

As a curious browser I want to filter by tag and search by name so that I find a style quickly.

- Given a kind list, when I type "halo", then only models whose name or tags match remain.
- Given no match, when the list empties, then I see an empty state with a "clear filters" button.

Test: e2e `components.spec.ts` (filter and empty state).

### RC-003 Read a component page (P0)

As an engaged couple I want a plain-language description with pros, cons and best-for so that I understand trade-offs.

- Given `#/components/head/halo-round`, when it loads, then I see summary, description, pros, cons, bestFor and a picture.
- Given the model has `related` ids, when I look at "See also", then each links to an existing component.

Test: unit `contract.test.ts` (related ids resolve); screenshot `component-pictures`.

### RC-004 See component specs in a table (P0)

As a jeweler I want numeric properties (mohs, density, durability, fitsCuts) in a SpecTable so that I can compare precisely.

- Given a metal or gem page, when it loads, then a SpecTable lists its numeric fields with units.
- Given a head page, when I look at fits, then compatible cuts are listed.

Test: e2e `components.spec.ts` (spec table rows).

### RC-005 Component pictures (P0)

As a curious browser I want a picture of each component so that I can compare looks without opening the builder.

- Given the CI run, when screenshots are captured, then every head, shank, band, cut and metal has an image under the published docs.
- Given an image is missing, when the page renders, then a placeholder with the model name appears.

Test: screenshot `component-pictures` (one per model, none missing).

### RC-006 Open a component in the builder (P1)

As an engaged couple I want "Use in builder" on a component so that I can try it on my ring.

- Given a head page, when I click "Use in builder", then `#/build` opens with that head applied to my current draft.
- Given the head does not fit my stone cut, when I click, then the cut changes to a fitting one and a toast says so.

Test: e2e `components.spec.ts` (use in builder).

## Epic B: Build engagement ring

### RC-007 Start a new design (P0)

As an engaged couple I want to start from a sensible default so that I see a ring immediately.

- Given I open `#/build` with no draft, when it loads, then a default round solitaire is shown with spec summary.
- Given a draft exists, when I open `#/build`, then it resumes the draft.

Test: e2e `build.spec.ts` (default design renders).

### RC-008 Choose stone material, color and cut (P0)

As an engaged couple I want to pick material, color and cut so that the center stone matches our taste.

- Given the Stone step, when I choose sapphire and cushion, then the viewport and spec summary update.
- Given a material with several colors, when I pick one, then only that material's colors are offered.

Test: e2e `build.spec.ts`; unit `design-validate.test.ts` (color belongs to material).

### RC-009 Set carat and see millimetres (P0)

As an engaged couple I want to set carat weight and see real size so that I know how big it looks.

- Given a 1.00 ct round diamond, when the step shows size, then it displays length x width x depth in mm from `dimsFromCarat`.
- Given I switch to moissanite at the same carat, when sizes recompute, then mm differ due to density.
- Given a carat outside 0.10 to 10.00, when I type it, then it clamps and shows a hint.

Test: unit `stoneMath.test.ts`; e2e `build.spec.ts` (mm shown).

### RC-010 Choose clarity and color grade (P1)

As an engaged couple I want clarity and color grades so that I trade quality against price knowingly.

- Given a diamond, when I pick SI2, then the spec shows "eye clean: no/yes" per the model and a visible haze in 3D.
- Given a non-diamond gem, when the Stone step shows, then the color-grade control is hidden.

Test: unit `contract.test.ts` (clarity haze 0..1); e2e `build.spec.ts`.

### RC-011 Choose a head (P0)

As an engaged couple I want to pick a head style so that the setting matches our style.

- Given the Head step, when I choose halo-round, then the 3D preview shows the halo and the head's controls appear.
- Given a head that cannot hold the current cut, when the list shows, then it is disabled with a reason.

Test: e2e `build.spec.ts`; unit `compat.test.ts`.

### RC-012 Choose a shank (P0)

As an engaged couple I want to pick a shank so that comfort and look suit daily wear.

- Given the Shank step, when I choose cathedral, then the shank rises toward the head.
- Given a shank with stones, when selected, then accent stone size control appears.

Test: e2e `build.spec.ts`; unit `geometry.test.ts` (every shank builds).

### RC-013 Tune head and shank parameters (P1)

As a jeweler I want sliders for each model's controls so that I can fine tune proportions.

- Given a head with number controls, when I move a slider, then the value updates within min/max/step and the 3D rebuilds within 150 ms.
- Given I reset a control, when I click reset, then the model default is restored.

Test: e2e `build.spec.ts`; unit `params.test.ts` (clamping).

### RC-014 Mix metals per part (P0)

As an engaged couple I want different metals for head and shank so that we can have a two-tone look.

- Given the Metals step, when I set head white-gold-18k and shank rose-gold-14k, then each part renders in its metal.
- Given mixed metals, when the summary shows, then it lists each part's metal.

Test: e2e `build.spec.ts`; screenshot `mixed-metal`.

### RC-015 Pick a finish (P1)

As an engaged couple I want polished, satin or hammered finishes so that the surface suits our taste.

- Given a finish, when selected, then roughness changes by the model's `roughnessAdd`.
- Given engraved, when selected, then a note explains it is shown as a texture only.

Test: unit `materials.test.ts` (roughness clamped 0..1); screenshot `finish-swatches`.

### RC-016 Set orientation, raise, tilt and offset (P0)

As a jeweler I want placement controls so that I can model east-west or low-profile settings.

- Given orientation east-west, when applied, then the long axis lies along the band.
- Given raise below the safe minimum, when typed, then it clamps and shows the minimum.
- Given tilt of 10 degrees, when applied, then the stone tips toward the fingertip.

Test: unit `placement.test.ts`; e2e `build.spec.ts`.

### RC-017 Set ring size (P0)

As an engaged couple I want to choose a US ring size so that the ring fits.

- Given the size select, when I pick 7, then the spec shows inner diameter from `innerDiameterMm(7)` and the 3D rebuilds.
- Given an imported design with size outside 3 to 13, when loaded, then it clamps with a warning.

Test: unit `stoneMath.test.ts` (innerDiameterMm monotonic); e2e `build.spec.ts`.

### RC-018 See a spec summary and rough price (P0)

As an engaged couple I want a summary bar so that I see the ring in one glance.

- Given any design, when the sticky summary shows, then it lists stone, head, shank, metals, size and a price range labelled "informational".
- Given a mobile viewport, when scrolling controls, then the summary stays visible.

Test: e2e `build.spec.ts`; screenshot `builder-mobile`.

### RC-019 Undo and redo (P1)

As a jeweler I want undo/redo so that I can explore without fear.

- Given I changed the head, when I press Ctrl+Z, then the previous head returns.
- Given I undid, when I press Ctrl+Shift+Z, then the change returns.

Test: unit `history.test.ts`.

### RC-020 Accent stones (P1)

As an engaged couple I want to choose the halo and pave stone material and size so that sparkle matches the budget.

- Given a halo head, when I pick moissanite 1.3 mm, then melee render at that size.
- Given a size outside the head's range, when typed, then it clamps.

Test: unit `geometry.test.ts`; e2e `build.spec.ts`.

## Epic C: Build wedding band

### RC-021 Add a matching band (P0)

As an engaged couple I want to add a wedding band to the design so that I see the pair together.

- Given an engagement-only design, when I open the Band step and click "Add band", then a plain-comfort band appears in Set view.
- Given a band exists, when I click "Remove band", then the design becomes engagement only.

Test: e2e `build.spec.ts` (add/remove band).

### RC-022 Choose a band style (P0)

As an engaged couple I want to browse band styles so that the band suits the ring.

- Given the Band step, when I choose half-eternity, then stones appear on the band and the stone size control shows.
- Given an audience filter (women/men/any), when I switch it, then the list narrows.

Test: e2e `build.spec.ts`; unit `geometry.test.ts` (every band builds).

### RC-023 Set band width, thickness and metals (P0)

As an engaged couple I want width, thickness and metal for the band so that it matches or contrasts.

- Given width 3 mm, when I change to 5 mm, then the band widens and the spec updates.
- Given a style with an inlay, when I set metal2, then the inlay shows in that metal.

Test: e2e `build.spec.ts`; unit `params.test.ts`.

### RC-024 Fit the band to the engagement ring (P0)

As a jeweler I want auto, flush and contour fit so that the band sits correctly beside the head.

- Given fit auto and a contour-capable style, when the head is tall, then the band curves away around theta = PI/2 by the computed retreat.
- Given a style that is not contour-capable, when fit is contour, then the UI explains and falls back to flush.
- Given fit flush, when applied, then no deviation is added.

Test: unit `contour.test.ts`; screenshot `contour-fit`.

### RC-025 Men's and stackable bands (P2)

As a curious browser I want men's and stacker styles so that I can plan a full set.

- Given audience men, when I open the list, then mens-classic, mens-hammered and mens-inlay appear.
- Given stacker-trio, when chosen, then three thin bands render together.

Test: unit `contract.test.ts` (band audience values); screenshot `band-styles`.

## Epic D: Preview 3D

### RC-026 View presets (P0)

As an engaged couple I want Ring / Band / Set / Top / Side views so that I can inspect every angle.

- Given the viewer toolbar, when I press Top, then the camera animates (or jumps under reduced motion) to a top-down view.
- Given no band, when I look at the toolbar, then Band and Set are disabled.

Test: e2e `viewer.spec.ts`.

### RC-027 Orbit, zoom and reset (P0)

As a curious browser I want to rotate and zoom so that I can look closely.

- Given the viewport, when I drag or use arrow keys, then the camera orbits.
- Given I zoomed in, when I press Reset or `R`, then the default framing returns.

Test: e2e `viewer.spec.ts` (keyboard orbit/reset).

### RC-028 Works without WebGL (P0)

As a curious browser on an old device I want a static picture so that the page is still useful.

- Given WebGL is unavailable, when the builder or gallery loads, then a static image and notice appear.
- Given the fallback, when I change controls, then the spec summary still updates.

Test: e2e `viewer.spec.ts` (WebGL disabled context).

### RC-029 Performance feedback (P1)

As a jeweler on a slow machine I want the app to stay responsive so that I can keep designing.

- Given a rebuild above 150 ms, when sliders move, then updates are debounced and the previous mesh stays visible.
- Given the scene loads, when measured on the reference setup, then it is interactive in under 3 s.

Test: e2e `perf.spec.ts` (time-to-interactive budget, informational in CI).

## Epic E: Save and share

### RC-030 Save designs locally (P0)

As an engaged couple I want to save and name designs so that I can return later.

- Given a design, when I click Save and enter a name, then it appears in `#/saved`.
- Given storage is blocked, when I click Save, then a toast says it cannot persist and offers Export.

Test: e2e `save.spec.ts`; unit `storage.test.ts`.

### RC-031 Manage saved designs (P0)

As an engaged couple I want to rename, duplicate and delete saved designs so that the list stays tidy.

- Given `#/saved`, when I delete a design, then a confirm modal appears and Undo is offered in a toast.
- Given no designs, when the page loads, then an empty state links to the builder and gallery.

Test: e2e `save.spec.ts`.

### RC-032 Export and import JSON (P0)

As a jeweler I want to export and import a design file so that I can hand it over.

- Given a design, when I click Export, then `<slug>.ring.json` downloads and validates against the schema.
- Given an invalid file, when I import it, then I see which fields failed and nothing is overwritten.
- Given a valid file, when I import it, then it opens as a draft.

Test: unit `design-validate.test.ts`; e2e `save.spec.ts`.

### RC-033 Share link (P0)

As an engaged couple I want a link that contains the design so that family can open exactly what we built.

- Given a design, when I click Share, then the link is copied and a toast confirms.
- Given a shared link, when opened, then the same design renders as an unsaved draft.
- Given a corrupted payload, when opened, then an error banner appears and the default design loads.

Test: unit `share.test.ts` (round trip, size); e2e `save.spec.ts`.

### RC-034 Compare designs (P1)

As an engaged couple I want to compare up to three designs so that we choose between finalists.

- Given `#/compare`, when I add saved designs, then up to three appear side by side with a diff table.
- Given I try a fourth, when I add it, then the control is disabled with a hint.

Test: e2e `compare.spec.ts`; screenshot `compare`.

## Epic F: Gallery of examples

### RC-035 Browse example rings (P0)

As a curious browser I want a gallery of classic and modern designs so that I find inspiration.

- Given `#/gallery`, when it loads, then each example shows a picture, name, style tags and metal.
- Given a tag filter, when I pick "vintage", then only matching examples remain.

Test: e2e `gallery.spec.ts`; screenshot `gallery`.

### RC-036 Open or copy an example (P0)

As an engaged couple I want to open an example in 3D and start from it so that we skip the blank page.

- Given `#/gallery/:exampleId`, when it loads, then it shows the ring in the viewer, its spec and a source link if present.
- Given I click "Start from this", when the builder opens, then the example is a new draft and the gallery entry is unchanged.

Test: e2e `gallery.spec.ts`.

### RC-037 Every example resolves (P0)

As a maintainer I want every example to reference valid ids so that the gallery never breaks.

- Given the example catalogue, when the contract test runs, then every metal, gem, cut, head, shank, band and finish id resolves.
- Given an unknown id, when the test runs, then it fails and names the example and field.

Test: unit `contract.test.ts` (all examples resolve, vocabulary).

## Epic G: Docs and learning

### RC-038 Read the docs in app (P1)

As a curious browser I want guides and a glossary in the app so that I can learn the terms.

- Given `#/docs`, when it loads, then the doc list shows with titles.
- Given `#/docs/:slug`, when I open one, then Markdown renders with working internal links.

Test: e2e `docs.spec.ts`.

### RC-039 Contextual help (P2)

As an engaged couple I want "what is this?" next to terms like cathedral or contour so that I learn while building.

- Given a control label with help, when I focus or hover the help icon, then the `help` text appears and is announced to screen readers.
- Given reduced motion, when the tip shows, then it appears without animation.

Test: e2e `a11y.spec.ts`.

## Epic H: Extensibility (add a model)

### RC-040 Add a model by data only (P0)

As a contributor I want to add a head, shank or band by adding a data entry so that no UI code changes.

- Given a new entry with a valid `builder` key, when I run `npm run validate`, then it passes and the model appears in the builder and catalogue.
- Given an entry with a missing field or unknown builder, when I validate, then the error names the file, id and field.

Test: unit `models-validate.test.ts`; guide `docs/guides/adding-components.md` (written later).

### RC-041 New builder registers once (P2)

As a contributor I want to add a geometry builder and reference it by key so that new shapes need one registry line.

- Given a new builder function, when registered, then the geometry sanity suite includes it automatically.
- Given a builder returning NaN positions, when the suite runs, then it fails with the model id.

Test: unit `geometry.test.ts` (iterates registry).

## Epic I: Quality and CI

### RC-042 Geometry sanity (P0)

As a maintainer I want every model to build valid geometry so that nothing renders broken.

- Given each head, shank and band with default params, when built, then positions are finite, parts non-empty and bounds within the ring envelope.
- Given min and max of every control, when built, then the same holds.

Test: unit `geometry.test.ts`.

### RC-043 Screenshots published in CI (P0)

As a maintainer I want component pictures captured in CI and published so that docs and gallery stay current.

- Given a push to main, when CI runs, then screenshots are captured at fixed viewport and seed and uploaded with the site.
- Given a screenshot cannot be produced, when CI finishes, then the job fails.

Test: screenshot `capture-all` (script `npm run screenshots`).

### RC-044 Deploy smoke test (P0)

As a maintainer I want a smoke test of the deployed site so that a broken deploy is caught.

- Given a deploy to GitHub Pages, when the smoke job runs, then `#/`, `#/build`, `#/gallery` and `#/components` load without console errors under the base path.
- Given a failure, when the job ends, then the deploy is marked failed.

Test: e2e `smoke.spec.ts` (against the preview or deployed URL).

### RC-045 Accessibility checks (P1)

As a user with a screen reader or keyboard I want the app to be operable so that I can design a ring.

- Given each main route, when axe-style checks run, then there are no serious or critical violations.
- Given the builder, when tabbing, then focus order follows visual order and the focus ring is visible.

Test: e2e `a11y.spec.ts`.
