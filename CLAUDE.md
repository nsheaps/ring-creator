# CLAUDE.md — ring-creator

A GitHub Pages SPA: design an engagement ring and a matching wedding band in 3D from data-driven component models.
Live: https://nsheaps.github.io/ring-creator/ · Repo: github.com/nsheaps/ring-creator · Default branch: `main` (commits go straight to `main`; CI deploys).

## Start here

- Architecture: `docs/specs/architecture.md`; vocabulary of ids: `docs/specs/vocabulary.md`; product spec, stories, wireframes, design system, test plan under `docs/`.
- Geometry contract (coordinate frames!): `src/geometry/types.ts`. Model schema: `src/models/types.ts`.

## Non-negotiables

- **Model-driven.** Everything pickable is a model entry in `src/models/data/*.ts`. Never hard-code a list of metals/cuts/heads in UI code; read the registry.
- Adding a component = data entry (+ a builder only if the shape is new). Follow `docs/guides/adding-components.md`.
- TypeScript strict, no `any`, no `@ts-ignore`. Geometry is deterministic (no unseeded randomness).
- Docs ship with code: a new/changed model updates its `description`; the component reference and pictures are generated (CI screenshots), never hand-placed.
- Pictures in docs come from CI (`mise run screenshots`), referenced as `{{base}}screenshots/...`.
- Never weaken a gate to get green; fix the code.

## Commands (mise wraps bun)

`mise run install | dev | lint | typecheck | test | validate | build | screenshots | check`

## Workflow

Small commits to `main`; `deploy.yml` runs the full gate, renders screenshots and publishes Pages. After pushing, watch the run and open the live site to confirm.
