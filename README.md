# Ring Creator

Design an engagement ring and a matching wedding band in 3D, right in the browser. Pick a stone (any cut, size, colour), a head/mount, a shank, metals (mix them per part), then add a band that contours around the head. Save, share and compare designs. No backend.

**Live:** https://nsheaps.github.io/ring-creator/

- **Everything is a model.** Metals, finishes, gems, clarities, cuts, heads, shanks and band styles are plain data in `src/models/data/`. New entries show up in the builder, the component reference, the docs and the screenshots automatically.
- **3D from parametric builders** in `src/geometry/` (three.js, no assets to download).
- **114 example rings** (in 86 design families) modelled from publicly listed rings; research notes with sources in `docs/research/`.
- **Docs:** user guides in `docs/guides/` (also rendered in the app under _Guides_), plus specs, user stories, wireframes, design system and test plan under `docs/`. Component pictures are rendered by CI.

## Develop

```bash
mise install && mise run install
mise run dev          # http://localhost:5173/ring-creator/
mise run check        # lint, typecheck, unit tests, model validation, build
mise run screenshots  # needs `mise run build` first and Playwright Chromium
```

Add a component: see `docs/guides/adding-components.md`. Regenerate examples from research: `bun run catalog:build`.

Deploys to GitHub Pages from `main` (`.github/workflows/deploy.yml`).
