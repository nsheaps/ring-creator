import { useEffect, useMemo, useState } from 'react';
import { exampleDesigns } from '@/models/data/examples';
import type { Design } from '@/models/types';
import { navigate, useRoute } from '@/router';
import { useStore } from '@/state/store';
import type { RingView } from '@/geometry/assemble';
import { DesignViewer } from '@/ui/DesignViewer';
import { SLOTS, compareHref, readPicks, writePicks } from '@/ui/home/compareLinks';
import { summarize, type Summary } from '@/ui/home/describe';
import './browse.css';

type Entry = Design & { priceUsd?: number | null };

const ROWS: [keyof Summary, string][] = [
  ['stone', 'Stone'],
  ['carat', 'Carat'],
  ['cut', 'Cut'],
  ['clarity', 'Clarity / color'],
  ['head', 'Head'],
  ['shank', 'Shank'],
  ['metals', 'Metals'],
  ['band', 'Band'],
  ['price', 'Est. price'],
];

export default function Compare() {
  const route = useRoute();
  const { current, saved } = useStore();
  const [view, setView] = useState<RingView>('set');

  const ids = SLOTS.map((k) => route.query.get(k) ?? '');
  const hasQuery = ids.some(Boolean);

  // With a bare #/compare, restore the picks remembered from "Add to compare".
  useEffect(() => {
    if (hasQuery) writePicks(ids.filter(Boolean));
    else {
      const picks = readPicks();
      if (picks.length) navigate(compareHref(picks));
    }
  }, [route.raw]);

  const lookup = useMemo(() => {
    const m = new Map<string, Entry>();
    exampleDesigns.forEach((d) => m.set(d.id, d));
    saved.forEach((s) => m.set(s.design.id, s.design));
    m.set('current', current);
    return m;
  }, [current, saved]);

  const setSlot = (i: number, id: string) => {
    const next = [...ids];
    next[i] = id;
    writePicks(next.filter(Boolean));
    navigate(buildHref(next));
  };

  const picked = ids.map((id) => (id ? lookup.get(id) : undefined));
  const active = picked.filter((d): d is Entry => !!d);
  const sums = picked.map((d) => (d ? summarize(d) : null));
  const differs = (k: keyof Summary) => new Set(sums.filter(Boolean).map((s) => s![k])).size > 1;
  const anyBand = active.some((d) => d.band);

  const views: [RingView, string][] = [
    ['ring', 'Ring'],
    ['band', 'Band'],
    ['set', 'Set'],
  ];

  return (
    <main className="page" data-testid="compare">
      <h1>Compare</h1>
      <p className="muted">Pick up to three designs from your current ring, saved designs and the gallery.</p>
      <div className="gal-toggle" role="group" aria-label="What to show">
        {views.map(([v, l]) => (
          <button key={v} className="btn" aria-pressed={view === v} disabled={v !== 'ring' && !anyBand} onClick={() => setView(v)}>
            {l}
          </button>
        ))}
      </div>
      <div className="cmp-cols">
        {SLOTS.map((k, i) => {
          const d = picked[i];
          return (
            <section key={k} className="cmp-col card" aria-label={`Slot ${i + 1}`} data-testid="compare-slot">
              <label className="gal-field">
                <span>Design {i + 1}</span>
                <select value={ids[i]} onChange={(e) => setSlot(i, e.target.value)} data-testid={`compare-pick-${k}`}>
                  <option value="">Choose a design…</option>
                  <option value="current">Current ring in builder</option>
                  {saved.length > 0 && (
                    <optgroup label="Saved">
                      {saved.map((s) => (
                        <option key={s.design.id} value={s.design.id}>
                          {s.design.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {exampleDesigns.length > 0 && (
                    <optgroup label="Gallery">
                      {exampleDesigns.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>
              {d ? (
                <>
                  <DesignViewer design={d} view={!d.band && view !== 'ring' ? 'ring' : view} refit />
                  <h2 className="cmp-name">{d.name}</h2>
                </>
              ) : (
                <div className="cmp-empty muted">{ids[i] ? 'That design was not found.' : 'Empty slot'}</div>
              )}
            </section>
          );
        })}
      </div>
      {active.length < 2 ? (
        <p className="muted" data-testid="compare-hint">
          Choose at least two designs to see their differences.
        </p>
      ) : (
        <div className="cmp-table-wrap">
          <table className="cmp-table" data-testid="compare-table">
            <caption className="sr-only">Differences between the chosen designs; differing rows are highlighted.</caption>
            <thead>
              <tr>
                <th scope="col">Spec</th>
                {picked.map((d, i) => (
                  <th scope="col" key={i}>
                    {d ? d.name : '—'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([k, label]) => (
                <tr key={k} className={differs(k) ? 'diff' : undefined} data-diff={differs(k) ? 'true' : 'false'}>
                  <th scope="row">
                    {label}
                    {differs(k) && <span className="sr-only"> (differs)</span>}
                  </th>
                  {sums.map((s, i) => (
                    <td key={i}>{s ? s[k] : '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function buildHref(ids: string[]): string {
  // Keeps slot positions: an emptied middle slot must not shift the others.
  const q = new URLSearchParams();
  ids.forEach((id, i) => {
    if (id) q.set(SLOTS[i], id);
  });
  const s = q.toString();
  return `/compare${s ? `?${s}` : ''}`;
}
