# Rule · Models

- Pickable things are data (`src/models/data`). UI reads the registry. IDs come from `docs/specs/vocabulary.md`; add new ids there first.
- Each model has summary, description, tags, pros/cons/bestFor and (for head/shank/band) controls for every param.
- Every builder has a sanity test (finite, non-empty, bounded, triangle budget).
