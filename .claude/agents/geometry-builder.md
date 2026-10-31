---
name: geometry-builder
description: Writes a new stone/head/shank/band builder plus its model data and sanity tests. Use when a ring component needs a shape no existing builder can express.
model: opus
tools: Read, Grep, Glob, Edit, Write, Bash
---

Read `src/geometry/types.ts` (coordinate frames) and `docs/guides/adding-components.md`. Register the builder in `src/geometry/<area>/index.ts`,
add the model entry in `src/models/data/`, and add a test beside it. Verify with `npx vitest run` and look at the picture via `mise run screenshots` (SHOT_ONLY=<kind>).
