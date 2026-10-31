import { useMemo, useState } from 'react';
import { exampleDesigns, type ExampleDesign } from '@/models/data/examples';
import { findModel } from '@/models/registry';
import { navigate, useRoute } from '@/router';
import { store } from '@/state/store';
import { DesignCard } from '@/ui/DesignCard';
import { DesignViewer } from '@/ui/DesignViewer';
import type { RingView } from '@/geometry/assemble';
import { addToCompare } from '@/ui/home/compareLinks';
import {
  cutName,
  headName,
  metalFamilies,
  metalNames,
  shankName,
  stoneLabel,
  summarize,
} from '@/ui/home/describe';
import './browse.css';

type Sort = 'featured' | 'name' | 'price-asc' | 'price-desc';

function uniq(xs: string[]): string[] {
  return [...new Set(xs)].sort((a, b) => a.localeCompare(b));
}

function Detail({ ex }: { ex: ExampleDesign }) {
  const [view, setView] = useState<RingView>(ex.band ? 'set' : 'ring');
  const s = summarize(ex);
  const rows: [string, string][] = [
    ['Center stone', `${s.stone}, ${s.carat}`],
    ['Cut', s.cut],
    ['Clarity / color', s.clarity],
    ['Head', s.head],
    ['Shank', s.shank],
    ['Metals', s.metals],
    ['Band', s.band],
    ['Ring size (US)', String(ex.ringSizeUS)],
    ['Approx. price', s.price],
  ];
  const views: [RingView, string][] = [
    ['ring', 'Ring'],
    ['band', 'Band'],
    ['set', 'Set'],
  ];
  return (
    <main className="page" data-testid="gallery-detail">
      <p>
        <a href="#/gallery">← All examples</a>
      </p>
      <h1>{ex.name}</h1>
      <p className="muted">{ex.blurb}</p>
      <div className="gal-detail">
        <div>
          <DesignViewer design={ex} view={view} refit />
          <div className="gal-toggle" role="group" aria-label="What to show">
            {views.map(([v, l]) => (
              <button
                key={v}
                className="btn"
                aria-pressed={view === v}
                disabled={!ex.band && v !== 'ring'}
                onClick={() => setView(v)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <table className="gal-spec" data-testid="spec-table">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <th scope="row">{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="dcard-chips">
            <span className="chip">{ex.category}</span>
            <span className="chip">{ex.designFamily}</span>
          </p>
          {ex.source && (
            <p>
              Inspired by{' '}
              <a href={ex.source.url} target="_blank" rel="noopener noreferrer">
                {ex.source.name} ↗
              </a>
            </p>
          )}
          <div className="gal-actions">
            <button
              className="btn primary"
              data-testid="open-in-builder"
              onClick={() => {
                store.load(ex);
                navigate('/build');
              }}
            >
              Open in builder
            </button>
            <button className="btn" data-testid="add-to-compare" onClick={() => addToCompare(ex.id)}>
              Add to compare
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function Gallery() {
  const route = useRoute();
  const id = route.path[1];
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [family, setFamily] = useState('');
  const [stone, setStone] = useState('');
  const [cut, setCut] = useState('');
  const [head, setHead] = useState('');
  const [sort, setSort] = useState<Sort>('featured');

  const facets = useMemo(
    () => ({
      categories: uniq(exampleDesigns.map((d) => d.category)),
      families: uniq(exampleDesigns.flatMap((d) => metalFamilies(d))),
      stones: uniq(exampleDesigns.map(stoneMaterial)),
      cuts: uniq(exampleDesigns.map(cutName)),
      heads: uniq(exampleDesigns.map(headName)),
    }),
    [],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = exampleDesigns.filter((d) => {
      if (category && d.category !== category) return false;
      if (family && !metalFamilies(d).includes(family as never)) return false;
      if (stone && stoneMaterial(d) !== stone) return false;
      if (cut && cutName(d) !== cut) return false;
      if (head && headName(d) !== head) return false;
      if (!needle) return true;
      const hay = [
        d.name,
        d.blurb,
        d.category,
        d.designFamily,
        cutName(d),
        headName(d),
        shankName(d),
        stoneLabel(d),
        ...metalNames(d),
        ...(d.tags ?? []),
      ]
        .join(' ')
        .toLowerCase();
      return needle.split(/\s+/).every((w) => hay.includes(w));
    });
    const price = (d: ExampleDesign) => (typeof d.priceUsd === 'number' ? d.priceUsd : null);
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'price-asc' || sort === 'price-desc') {
      const dir = sort === 'price-asc' ? 1 : -1;
      list.sort((a, b) => {
        const pa = price(a);
        const pb = price(b);
        if (pa === null && pb === null) return 0;
        if (pa === null) return 1; // unknown prices last either way
        if (pb === null) return -1;
        return (pa - pb) * dir;
      });
    }
    return list;
  }, [q, category, family, stone, cut, head, sort]);

  if (id) {
    const ex = exampleDesigns.find((d) => d.id === id);
    if (ex) return <Detail ex={ex} />;
    return (
      <main className="page">
        <p>
          <a href="#/gallery">← All examples</a>
        </p>
        <h1>Example not found</h1>
        <p className="muted">No example ring has the id “{id}”.</p>
      </main>
    );
  }

  const filtered = Boolean(q || category || family || stone || cut || head);
  const clear = () => {
    setQ('');
    setCategory('');
    setFamily('');
    setStone('');
    setCut('');
    setHead('');
  };
  const select = (
    label: string,
    value: string,
    set: (v: string) => void,
    options: string[],
    testId: string,
  ) => (
    <label className="gal-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => set(e.target.value)} data-testid={testId}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <main className="page" data-testid="gallery">
      <h1>Gallery</h1>
      <p className="muted">Example rings to start from. Open one in the builder to make it your own.</p>
      {exampleDesigns.length === 0 ? (
        <p className="muted" data-testid="gallery-empty">
          No example rings yet. <a href="#/build">Start a design from scratch</a>.
        </p>
      ) : (
        <>
          <form
            className="gal-filters card"
            role="search"
            aria-label="Filter examples"
            onSubmit={(e) => e.preventDefault()}
          >
            <label className="gal-field gal-search">
              <span>Search</span>
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name, style, metal, stone…"
                data-testid="gallery-search"
              />
            </label>
            {select('Metal', family, setFamily, facets.families, 'filter-metal')}
            {select('Stone', stone, setStone, facets.stones, 'filter-stone')}
            {select('Cut', cut, setCut, facets.cuts, 'filter-cut')}
            {select('Head', head, setHead, facets.heads, 'filter-head')}
            <label className="gal-field">
              <span>Sort by</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                data-testid="gallery-sort"
              >
                <option value="featured">Featured</option>
                <option value="name">Name</option>
                <option value="price-asc">Price, low to high</option>
                <option value="price-desc">Price, high to low</option>
              </select>
            </label>
            <div className="gal-chips" role="group" aria-label="Category">
              <button
                type="button"
                className="chip"
                aria-pressed={category === ''}
                onClick={() => setCategory('')}
              >
                All
              </button>
              {facets.categories.map((c) => (
                <button
                  type="button"
                  key={c}
                  className="chip"
                  aria-pressed={category === c}
                  onClick={() => setCategory(category === c ? '' : c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </form>
          <p className="muted" aria-live="polite" data-testid="gallery-count">
            {shown.length} of {exampleDesigns.length} rings{filtered && ' · '}
            {filtered && (
              <button type="button" className="linkbtn" onClick={clear}>
                Clear filters
              </button>
            )}
          </p>
          {shown.length === 0 ? (
            <p data-testid="gallery-none">No rings match. Try fewer filters.</p>
          ) : (
            <div className="grid gal-grid" data-testid="gallery-grid">
              {shown.map((d) => (
                <DesignCard key={d.id} design={d} href={`/gallery/${encodeURIComponent(d.id)}`} live />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}

function stoneMaterial(d: ExampleDesign): string {
  return findModel('gem', d.engagement.center.material)?.name ?? d.engagement.center.material;
}
