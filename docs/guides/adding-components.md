---
title: Adding components
order: 11
summary: Developer guide to the model schema, vocabulary, data files and builders, with worked examples for a new head variant and a new cut, plus the checks and checklist.
---

# Adding components

This guide is for people changing the app. If you only want to use it, start with [Getting started](#/docs/getting-started).

Ring Creator is **model-driven**. Everything a person can pick (a metal, a gem, a cut, a head, a shank, a band style) is a plain data entry. The pickers, the Components pages, the Gallery and the pictures all read from one registry. So:

> **Adding a component = adding a data entry.** Write geometry code only when the shape is genuinely new.

## The moving parts

| Part | Where | Role |
| --- | --- | --- |
| Vocabulary | `docs/specs/vocabulary.md` | The list of allowed ids. Add the id here first. Ids are never renamed silently. |
| Model schema | `src/models/types.ts` | TypeScript types for every model kind and for saved designs. |
| Data | `src/models/data/*.ts` | One file per kind: `metals`, `finishes`, `gems`, `clarities`, `colorGrades`, `cuts`, `heads`, `shanks`, `bands`. |
| Registry | `src/models/registry.ts` | `registerModels`, `listModels`, `findModel`, `getModel`. The data index loads every file. |
| Geometry types | `src/geometry/types.ts` | Coordinate frames, `Part`, the builder contexts. Read its header comment first. |
| Geometry helpers | `src/geometry/helpers.ts` | `sweepRing`, `cylinderBetween`, `instanceGeometry`, `mergeFlat`. |
| Builder registry | `src/geometry/builders.ts` | `registerStoneBuilder`, `registerHeadBuilder`, `registerShankBuilder`, `registerBandBuilder`. |
| Assembly | `src/geometry/assemble.ts` | Turns a `Design` into three.js meshes and assigns a material per part slot. |
| Validation | `scripts/validate-models.ts` | The data-contract gate (see below). |

Rules for contributors: TypeScript strict with no `any` and no `@ts-ignore`, geometry deterministic (no unseeded randomness), docs in the same change.

## The schema in one page

Every model extends `ModelBase`:

| Field | Meaning |
| --- | --- |
| `id` | Kebab-case, unique within its kind. Must match the vocabulary. |
| `name` | Display name. |
| `summary` | One plain sentence (at least 10 characters). |
| `description` | Markdown, two to four short paragraphs, user-facing (at least 80 characters). |
| `tags` | Search and filter tags. |
| `pros`, `cons`, `bestFor` | Short lists shown on the Components page. |
| `related` | Ids of other models for "see also". They must resolve. |

On top of that:

- **Cuts** (`kind: 'cut'`) add `builder`, `params`, `volumeFactor`, `defaultAspect`, `aspectRange`, `defaultDepthPct`, `facetStyle`, `facetCount` and `vulnerableCorners`.
- **Heads** add `builder`, `params`, `controls`, `fitsCuts` (a list of cut ids or `'all'`), `extraStones`, and three 1 to 5 ratings: `protection`, `brilliance`, `upkeep` (5 means easy to clean).
- **Shanks** add `builder`, `params`, `controls`, `hasStones`, `comfort`, `durability`.
- **Bands** add `builder`, `params`, `controls`, `hasStones`, `contourCapable` and `audience` (`women`, `men` or `any`).

**Controls** describe the sliders, selects and toggles the builder shows for a model's own options. Each control has a `key`, a `label`, a `type` (`number` with `min`, `max`, `step`, optional `unit`; `select` with `options`; or `toggle`) and optional `help`. **Every control key must also appear in the model's `params`**, which hold the defaults. The validator fails otherwise.

## How a data entry points to a builder

A model's `builder` string is a key into a builder registry. A builder is a function that receives a context and returns geometry. Many models can share one builder and differ only in `params`. That is how a family of halo heads, or a family of cut variants, can come from one function.

| Kind | Builder signature | Frame |
| --- | --- | --- |
| Cut | `(dims, params, opts) -> BuiltStone` | Stone frame |
| Head | `(ctx: HeadCtx) -> Part[]` | Stone frame, girdle at y = 0 |
| Shank | `(ctx: ShankCtx) -> { parts, seatY, topWidth }` | Ring frame |
| Band | `(ctx: BandCtx) -> Part[]` | Ring frame, centred on z = 0 |

### Coordinate frames

All units are **millimetres**.

- **Ring frame:** the finger axis is +Z, the ring centre is the origin, the top of the ring (where the stone sits) is +Y and the band tangent at the top is +X. Angle theta runs from +X toward +Y, so the top is theta = PI/2.
- **Stone frame:** origin at the girdle centre, length along +X, width along +Z, table facing +Y, culet at -Y. Heads are built here and the assembler moves them into place.

### Parts and slots

A builder returns `Part` objects, each with a `slot` (`center-stone`, `accent-stone`, `head-metal`, `shank-metal`, `band-metal`, `band-metal2` or `band-stone`), a three.js `geometry` and an optional `label`. The assembler gives each slot its own material, which is why each part can have its own metal. Parts that share a slot are merged with `mergeFlat`, which flattens indexed geometry (such as the output of `sweepRing`) first, so either kind is fine. Stone builders must return non-indexed, flat-shaded geometry.

### The context (`ctx`)

- **HeadCtx:** `center` (the resolved stone with its dimensions and built outline), `accent` (the accent stone spec), `params` (the model defaults merged with the user's overrides), `baseDrop` (distance from the girdle down to the shank top; the head must reach y = -baseDrop to join the shank), `shankWidth`, `bandAxis` (a unit vector along the band, `[1,0]` for east-west and `[0,1]` for north-south), `stone(cutId, dims, opts)` to make and cache side stones or halo stones, and `innerRadius`.
- **ShankCtx:** `innerRadius`, `center`, `accent`, `params`, `headHalfAlongBand` and `headHalfAlongFinger` (the head footprint, used for cathedral rise or split starts) and `stone`.
- **BandCtx:** `innerRadius`, `params`, `widthMm`, `thicknessMm`, `accent`, an optional `contour` (retreat, half angle and direction for bands that bend away from the head) and `stone`. Build centred on z = 0; the assembler translates the band.

Read `src/geometry/types.ts` for the exact definitions, and note that a builder must be **deterministic**, keep to a triangle budget (about 60k triangles per ring part set; use `detail: 'low'` stones for pave and melee) and produce finite coordinates, non-empty triangles and outward winding.

## Worked example 1: a new head variant from an existing builder

Goal: a taller, slimmer halo head, "halo-round-tall", that reuses the existing round halo builder with different parameters. No geometry code.

1. **Vocabulary.** Add `halo-round-tall` to the `Heads / mounts (head)` list in `docs/specs/vocabulary.md`.
2. **Find the donor.** Open the `halo-round` entry in `src/models/data/heads.ts`. Copy its `builder` key, its `params` and its `controls`.
3. **Add the entry** next to it:

```ts
{
  kind: 'head',
  id: 'halo-round-tall',
  name: 'Tall Round Halo',
  summary: 'A halo set high on slim prongs, so the stone and its frame sit proud of the band.',
  description:
    'A tall halo lifts the centre stone and its ring of accent stones above the shank, which shows more of the stone from the side and leaves room underneath.\n\nIt photographs well and flatters a round or cushion centre. The extra height catches more on clothing, so it suits careful wear.',
  tags: ['halo', 'tall', 'glamorous'],
  pros: ['Shows more of the stone', 'Easy to clean underneath'],
  cons: ['Catches on clothing', 'Less snug against a straight band'],
  bestFor: ['Round and cushion centres', 'Special-occasion wear'],
  related: ['halo-round', 'cathedral-head'],
  builder: 'halo', // copy the key from the halo-round entry
  params: { /* copy halo-round's params, then change the ones that set height */ },
  controls: [ /* copy halo-round's controls; every key must exist in params */ ],
  fitsCuts: ['round-brilliant', 'cushion'],
  extraStones: 'pave halo (~30)',
  protection: 3,
  brilliance: 5,
  upkeep: 2,
},
```

4. **Check.** Run `mise run validate`. It confirms the builder key exists, the text is long enough, the id is kebab-case and every control has a default.
5. **Look at it.** Run `mise run dev`, open the Head tab and select the new card. Try three cuts and several carat sizes, and look from the Side and Top cameras.
6. **Describe it well.** Users read the `description`. Say what it is, how it looks, who it suits.
7. **Pictures.** You do not add any. CI renders `screenshots/components/head/halo-round-tall.png` from the harness route `#/shot/component/head/halo-round-tall`.

## Worked example 2: adding a new cut

Goal: an octagon cut, a rectangle with cut corners.

1. **Vocabulary.** Add `octagon` under `Cuts (stone.cut)`.
2. **Write a builder** in `src/geometry/stones/octagon.ts` and register it. A cut builder receives the stone's `dims` (length, width, depth in mm) and returns a `BuiltStone` with a non-indexed geometry, the girdle `outline`, `crownHeight`, `pavilionDepth` and `girdleThickness`. This sketch is deliberately minimal; real cuts add more facets.

```ts
import * as THREE from 'three';
import { registerStoneBuilder } from '../builders';
import type { BuiltStone, StoneBuilder } from '../types';

const build: StoneBuilder = (dims, params) => {
  const clip = Math.min(0.45, Math.max(0.1, Number(params.clip ?? 0.3)));
  const hl = dims.length / 2;
  const hw = dims.width / 2;
  const c = clip * Math.min(hl, hw);
  // Counter-clockwise seen from +Y, in the (x, z) plane.
  const pts: [number, number][] = [
    [hl - c, -hw], [-hl + c, -hw], [-hl, -hw + c], [-hl, hw - c],
    [-hl + c, hw], [hl - c, hw], [hl, hw - c], [hl, -hw + c],
  ];
  const crown = dims.depth * 0.3;
  const pavilion = dims.depth * 0.7;
  const table = 0.65;
  const v: number[] = [];
  const tri = (a: number[], b: number[], d: number[]) => v.push(...a, ...b, ...d);
  const top = [0, crown, 0];
  const culet = [0, -pavilion, 0];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % n];
    const g0 = [x0, 0, z0], g1 = [x1, 0, z1];
    const t0 = [x0 * table, crown, z0 * table], t1 = [x1 * table, crown, z1 * table];
    tri(top, t0, t1);        // table, faces up
    tri(g0, g1, t0);         // crown, faces out and up
    tri(g1, t1, t0);
    tri(g1, g0, culet);      // pavilion, faces out and down
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geometry.computeVertexNormals(); // non-indexed, so shading is flat
  const built: BuiltStone = {
    geometry,
    outline: { points: pts, corners: pts.map((_, i) => i) },
    crownHeight: crown,
    pavilionDepth: pavilion,
    girdleThickness: Math.max(0.1, dims.width * 0.02),
  };
  return built;
};

registerStoneBuilder('octagon', build);
```

3. **Import it** from the folder's index so the registration runs (`src/geometry/index.ts` imports each folder, and each folder's index imports its builders).
4. **Add the data entry** to `src/models/data/cuts.ts`:

```ts
{
  kind: 'cut',
  id: 'octagon',
  name: 'Octagon',
  summary: 'A rectangle with cut corners and stepped facets, a softer cousin of the emerald cut.',
  description: 'The octagon cut has eight sides ...',
  tags: ['step', 'vintage'],
  builder: 'octagon',
  params: { clip: 0.3 },
  volumeFactor: 0.0, // use the standard weight-estimation constant for the shape
  defaultAspect: 1.3,
  aspectRange: [1.0, 1.6],
  defaultDepthPct: 0.6,
  facetStyle: 'step',
  facetCount: 25,
  vulnerableCorners: 4,
},
```

`volumeFactor` is the constant in `ct = volumeFactor x L x W x D x (SG / 3.52)`, which `dimsFromCarat` uses to turn carat into millimetres. Take the factor from an established gemological source for the shape and cite it in a code comment. The `0.0` above is a placeholder, not a real value.

5. **Which heads fit it?** Add `octagon` to the `fitsCuts` of heads that suit it. A head with `fitsCuts: 'all'` already accepts it.
6. **Validate and run.** `mise run validate`, `mise run test`, then try the cut with several heads and carats.

## Tests

- **Geometry sanity:** every builder must produce finite coordinates, a non-empty mesh, a plausible bounding box and a triangle count within budget, at default parameters and at the extremes of each control. The shared sanity tests walk the builder registry, so a registered builder is covered automatically. Add a focused test for any special behaviour.
- **Examples:** `tests/examples.test.ts` assembles every gallery ring.
- **Materials:** `src/models/data/materials.test.ts` checks metal and finish data.
- Run everything with `mise run test`. For a bug, write the failing test first.

## Validation

`mise run validate` runs `scripts/validate-models.ts`. It checks that:

- every cut, head, shank and band names a registered builder;
- each model's summary and description are long enough, its id is kebab-case, and each control key has a default in `params`;
- every id in the vocabulary has a model;
- every example ring resolves its gem, colour, cut, head, shank, band, metals and finish ids;
- there are at least 100 examples in at least 15 design families, with unique ids.

The full local gate is `mise run check`, which runs lint, typecheck, tests, validate and build. CI runs the same steps, then installs Chromium, runs `mise run screenshots` and publishes the site.

## Screenshots

Pictures are never made by hand. `mise run screenshots` builds the app, starts a preview server and drives a headless browser to the harness routes `#/shot/<kind>/<id>`, saving `screenshots/components/<kind>/<id>.png` for every model, `screenshots/examples/<id>.png` for every example, and a handful of page pictures. If a model has no picture, the capture script reports a failure. In guides, reference pictures as `{{base}}screenshots/components/<kind>/<id>.png`. The `{{base}}` placeholder is replaced with the site's base path at run time.

## Adding an example ring

Example rings are generated from the research records in `data/research/rings-*.json` by `scripts/build-examples.ts`, which writes `src/models/data/examples/rings.ts` (generated and committed). Records state only what a source stated, and gaps are filled with the nearest sensible default and flagged in the blurb. To add one, add a record with a real source URL, run the script (for example `bunx tsx scripts/build-examples.ts`) and commit the result. Each example needs a unique id, a category, a design family, a blurb and, where known, a price and a source. Keep to facts: no copied prose or images. See [Gallery and examples](#/docs/gallery-and-examples) for how they appear.

## Checklist

- [ ] Id added to `docs/specs/vocabulary.md` first.
- [ ] Entry added to the right `src/models/data/*.ts` file, with a real summary, description, pros, cons and bestFor.
- [ ] Every control key exists in `params`.
- [ ] New shape only: builder written, registered and imported; deterministic; inside the triangle budget.
- [ ] `fitsCuts` (heads) and `related` ids resolve.
- [ ] `mise run validate` and `mise run test` pass.
- [ ] Looked at it in the builder with several cuts, sizes and metals.
- [ ] A guide updated if behaviour users see has changed ([Settings and mounts](#/docs/settings-and-mounts), [Stone cuts](#/docs/stone-cuts), [Shanks and styles](#/docs/shanks-and-styles) or [Wedding bands and fit](#/docs/wedding-bands-and-fit)).
- [ ] `mise run check` passes; no hand-made pictures committed.
