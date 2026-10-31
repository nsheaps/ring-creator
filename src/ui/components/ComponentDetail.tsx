import { useMemo, useState } from 'react';
import { KIND_LABELS, findModel, listModels } from '@/models/registry';
import { dimsFromCarat } from '@/models/stoneMath';
import type { CutModel, Model, ModelKind } from '@/models/types';
import { navigate } from '@/router';
import { defaultBand } from '@/state/defaults';
import { store } from '@/state/store';
import { renderMarkdown } from '@/ui/docs/markdown';
import { ModelViewer } from '@/ui/ModelViewer';
import { ShotImage } from './ComponentCard';
import { findAny, specRows } from './specs';

function Dots({ n }: { n: number }) {
  return (
    <span className="rf-dots" role="img" aria-label={`${n} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= n ? 'on' : ''} aria-hidden="true" />
      ))}
    </span>
  );
}

/** Set this model on the current design. */
export function applyToDesign(model: Model): void {
  store.update((d) => {
    const e = d.engagement;
    switch (model.kind) {
      case 'cut':
        e.center.cut = model.id;
        break;
      case 'head':
        e.head.id = model.id;
        e.head.params = {};
        break;
      case 'shank':
        e.shank.id = model.id;
        e.shank.params = {};
        break;
      case 'band':
        d.band = d.band ?? defaultBand();
        d.band.style = model.id;
        d.band.params = {};
        break;
      case 'metal':
        e.head.metal = e.shank.metal = model.id;
        if (d.band) d.band.metal = model.id;
        break;
      case 'finish':
        e.finish = model.id;
        if (d.band) d.band.finish = model.id;
        break;
      case 'gem':
        e.center.material = model.id;
        e.center.color = model.defaultColor;
        break;
      case 'clarity':
        e.center.clarity = model.id;
        break;
      case 'color-grade':
        e.center.colorGrade = model.id;
        break;
    }
  });
  navigate('#/build');
}

const CARATS = [0.5, 0.75, 1, 1.5, 2, 3];

function SizeChart({ cut }: { cut: CutModel }) {
  const gem = findModel('gem', 'diamond') ?? listModels('gem')[0];
  if (!gem) return null;
  return (
    <section aria-labelledby="size-chart">
      <h2 id="size-chart">Size chart</h2>
      <p className="muted">Approximate face-up size of a diamond in this cut at its default proportions.</p>
      <div className="rf-scroll">
        <table data-testid="size-chart">
          <thead>
            <tr>
              <th scope="col">Carat</th>
              <th scope="col">Length (mm)</th>
              <th scope="col">Width (mm)</th>
              <th scope="col">Depth (mm)</th>
            </tr>
          </thead>
          <tbody>
            {CARATS.map((ct) => {
              const d = dimsFromCarat(cut, gem, { carat: ct });
              return (
                <tr key={ct}>
                  <th scope="row">{ct} ct</th>
                  <td>{d.length.toFixed(2)}</td>
                  <td>{d.width.toFixed(2)}</td>
                  <td>{d.depth.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ComponentDetail({ kind, id }: { kind: ModelKind; id: string }) {
  const model = findModel(kind, id) as Model | undefined;
  const [mode, setMode] = useState<'live' | 'shot'>('live');
  const html = useMemo(() => (model ? renderMarkdown(model.description).html : ''), [model]);

  if (!model) {
    return (
      <main className="page rf">
        <h1>Not found</h1>
        <p>
          There is no {kind} called “{id}”. <a href={`#/components/${kind}`}>Back to the list</a>.
        </p>
      </main>
    );
  }

  const list = listModels(kind) as Model[];
  const idx = list.findIndex((m) => m.id === id);
  const prev = list[idx - 1];
  const next = list[idx + 1];
  const related = (model.related ?? []).map(findAny).filter((m): m is Model => !!m);
  const rows = specRows(model);
  const params = 'params' in model ? Object.entries(model.params) : [];
  const controls = 'controls' in model ? model.controls : [];

  return (
    <main className="page rf" data-testid="component-detail">
      <nav className="rf-crumbs" aria-label="Breadcrumb">
        <a href="#/components">Components</a> / <a href={`#/components/${kind}`}>{KIND_LABELS[kind]}</a> /{' '}
        <span>{model.name}</span>
      </nav>
      <h1>{model.name}</h1>
      <p className="rf-lede">{model.summary}</p>
      <div className="rf-chips">
        {model.tags.map((t) => (
          <span key={t} className="chip">
            {t}
          </span>
        ))}
      </div>

      <div className="rf-layout">
        <div className="rf-media">
          <div className="rf-modes" role="group" aria-label="Preview type">
            <button className="btn" aria-pressed={mode === 'live'} onClick={() => setMode('live')}>
              Live 3D
            </button>
            <button className="btn" aria-pressed={mode === 'shot'} onClick={() => setMode('shot')}>
              Picture
            </button>
          </div>
          {mode === 'live' ? (
            <ModelViewer model={model} />
          ) : (
            <div className="viewer rf-shot">
              <ShotImage model={model} />
              <p className="muted rf-shot-missing">
                The CI picture appears here once screenshots are generated.
              </p>
            </div>
          )}
          <div className="rf-actions">
            <button className="btn primary" onClick={() => applyToDesign(model)} data-testid="use-in-builder">
              Use in builder
            </button>
          </div>
        </div>

        <div className="rf-info">
          <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
          {(model.bestFor?.length || model.pros?.length || model.cons?.length) && (
            <div className="rf-pc">
              {model.pros && model.pros.length > 0 && (
                <section aria-labelledby="pros">
                  <h2 id="pros">Pros</h2>
                  <ul>
                    {model.pros.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </section>
              )}
              {model.cons && model.cons.length > 0 && (
                <section aria-labelledby="cons">
                  <h2 id="cons">Cons</h2>
                  <ul>
                    {model.cons.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </section>
              )}
              {model.bestFor && model.bestFor.length > 0 && (
                <section aria-labelledby="best">
                  <h2 id="best">Best for</h2>
                  <ul>
                    {model.bestFor.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      </div>

      <section aria-labelledby="specs">
        <h2 id="specs">Specifications</h2>
        <div className="rf-scroll">
          <table data-testid="spec-table">
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row">{r.label}</th>
                  <td>
                    {r.rating !== undefined ? (
                      <>
                        <Dots n={r.rating} /> <span className="muted">{r.text}</span>
                      </>
                    ) : r.swatch ? (
                      <>
                        <span className="rf-swatch" style={{ background: r.swatch }} aria-hidden="true" />{' '}
                        {r.text}
                      </>
                    ) : (
                      r.text
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {model.kind === 'gem' && (
        <section aria-labelledby="colors">
          <h2 id="colors">Colors</h2>
          <ul className="rf-colors">
            {model.colors.map((c) => (
              <li key={c.id}>
                <span className="rf-swatch" style={{ background: c.hex }} aria-hidden="true" /> {c.name}
                {c.rarity ? <span className="muted"> ({c.rarity})</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {params.length > 0 && (
        <section aria-labelledby="params">
          <h2 id="params">Parameters</h2>
          <div className="rf-scroll">
            <table data-testid="params-table">
              <thead>
                <tr>
                  <th scope="col">Parameter</th>
                  <th scope="col">Value</th>
                </tr>
              </thead>
              <tbody>
                {params.map(([k, v]) => (
                  <tr key={k}>
                    <th scope="row">
                      <code>{k}</code>
                    </th>
                    <td>{String(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {controls.length > 0 && (
        <section aria-labelledby="controls">
          <h2 id="controls">Adjustable options</h2>
          <ul>
            {controls.map((c) => (
              <li key={c.key}>
                <strong>{c.label}</strong>
                {c.type === 'number' && (
                  <span className="muted">
                    {' '}
                    {c.min} to {c.max}
                    {c.unit ? ` ${c.unit}` : ''}
                  </span>
                )}
                {c.help ? <span className="muted"> {c.help}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {model.kind === 'cut' && <SizeChart cut={model} />}

      {related.length > 0 && (
        <section aria-labelledby="related">
          <h2 id="related">Related</h2>
          <ul className="rf-related" data-testid="related">
            {related.map((m) => (
              <li key={m.id}>
                <a href={`#/components/${m.kind}/${m.id}`}>{m.name}</a>{' '}
                <span className="muted">{KIND_LABELS[m.kind]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="rf-pn" aria-label={`More ${KIND_LABELS[kind]}`}>
        {prev ? <a href={`#/components/${kind}/${prev.id}`}>← {prev.name}</a> : <span />}
        {next ? <a href={`#/components/${kind}/${next.id}`}>{next.name} →</a> : <span />}
      </nav>
    </main>
  );
}
