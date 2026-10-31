import { useMemo, useState } from 'react';
import { KIND_LABELS, listModels } from '@/models/registry';
import type { Model, ModelKind } from '@/models/types';
import { ComponentCard } from './ComponentCard';
import { KINDS, matches } from './specs';

export function ComponentsIndex({ only }: { only?: ModelKind }) {
  const [q, setQ] = useState('');
  const kinds = only ? [only] : KINDS;
  const sections = useMemo(
    () => kinds.map((k) => ({ kind: k, items: (listModels(k) as Model[]).filter((m) => matches(m, q)) })),
    [q, only],
  );
  const total = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <main className="page rf">
      <nav className="rf-crumbs" aria-label="Breadcrumb">
        <a href="#/components">Components</a>
        {only && <span> / {KIND_LABELS[only]}</span>}
      </nav>
      <h1>{only ? KIND_LABELS[only] : 'Components'}</h1>
      <p className="muted">
        Every part you can pick in the builder. Each one has a live 3D preview, full specs and a one-click
        “Use in builder”.
      </p>
      <div className="rf-toolbar">
        <label className="rf-search">
          <span className="sr-only">Search components</span>
          <input
            type="search"
            placeholder="Search components"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="component-search"
          />
        </label>
        <span className="muted" aria-live="polite">
          {total} found
        </span>
      </div>
      <nav className="rf-jump" aria-label="Jump to a kind">
        {KINDS.map((k) => (
          <a key={k} className="chip" href={`#/components/${k}`}>
            {KIND_LABELS[k]} <span aria-hidden="true">({listModels(k).length})</span>
          </a>
        ))}
      </nav>
      {sections.map(
        (s) =>
          (s.items.length > 0 || !q) && (
            <section key={s.kind} id={s.kind} className="rf-section" aria-labelledby={`h-${s.kind}`}>
              <h2 id={`h-${s.kind}`}>
                <a href={`#/components/${s.kind}`}>{KIND_LABELS[s.kind]}</a>
              </h2>
              {s.items.length === 0 ? (
                <p className="muted">None yet.</p>
              ) : (
                <div className="grid">
                  {s.items.map((m) => (
                    <ComponentCard key={m.id} model={m} />
                  ))}
                </div>
              )}
            </section>
          ),
      )}
      {total === 0 && q && <p className="muted">Nothing matches “{q}”.</p>}
    </main>
  );
}
