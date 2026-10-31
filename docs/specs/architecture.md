# Architecture

Vite + React 18 + TypeScript (strict) + three.js. No backend. Hash router so GitHub Pages deep links work.

## Model-driven

`src/models/types.ts` defines models (metal, finish, gem, clarity, color-grade, cut, head, shank, band). Data lives in
`src/models/data/*.ts`; `registerModels` loads them. A model with a `builder` key points at geometry code
registered in `src/geometry/builders.ts`. **Adding a ring component = add a data entry (and, only if the shape is new, a builder).**
UI lists, the component reference docs and the example gallery are all generated from the registry.

## Geometry

Types and coordinate frames: `src/geometry/types.ts` (read the header comment). Helpers: `src/geometry/helpers.ts`
(`sweepRing`, `cylinderBetween`, `instanceGeometry`, `mergeFlat`).

- Stones: `StoneBuilder(dims, params, opts) -> BuiltStone` (flat shaded, non-indexed).
- Heads: `HeadBuilder(ctx) -> Part[]` in the stone frame (girdle at y=0).
- Shanks: `ShankBuilder(ctx) -> {parts, seatY, topWidth}` in the ring frame.
- Bands: `BandBuilder(ctx) -> Part[]` in the ring frame, centred on z=0.
  Parts carry a `slot`; the assembler assigns materials per slot so every part can have its own metal (mixed metals).

## Conventions

mm everywhere. Geometry must have finite coordinates, non-empty triangles, correct outward winding, keep to <= ~60k triangles per ring part
set (pave/melee uses `detail: 'low'` stones). Deterministic (no Math.random without a seeded PRNG).
