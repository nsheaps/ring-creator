import { useMemo } from 'react';
import { exampleDesigns } from '@/models/data/examples';
import { listModels } from '@/models/registry';
import { defaultDesign } from '@/state/defaults';
import { DesignViewer } from '@/ui/DesignViewer';
import { DesignCard } from '@/ui/DesignCard';
import './browse.css';

const STEPS: [string, string][] = [
  ['Choose a stone', 'Pick the gem, cut, carat, color and clarity. The size updates as you change carat.'],
  ['Shape the setting', 'Combine a head (prongs, bezel, halo) with a shank and set the metal of each part.'],
  ['Add a matching band', 'Choose a wedding band style that sits flush or contours around your engagement ring.'],
  ['Save, compare, share', 'Keep designs in your browser, compare up to three side by side, export or share a link.'],
];

const FEATURES: [string, string][] = [
  ['Build it in 3D', 'Every change redraws a real 3D model you can spin and zoom: stones, prongs, shanks and bands.'],
  ['Mix anything', 'Mixed metals, side stones, halos, east-west stones and more. Components come from a growing catalogue.'],
  ['Learn as you go', 'Guides and a reference for every cut, clarity, metal and style, so you know what you are choosing.'],
];

function pickFeatured<T extends { designFamily: string }>(all: T[], n: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of all) {
    if (!seen.has(r.designFamily)) {
      seen.add(r.designFamily);
      out.push(r);
    }
    if (out.length === n) return out;
  }
  for (const r of all) {
    if (out.length === n) break;
    if (!out.includes(r)) out.push(r);
  }
  return out;
}

export default function Home() {
  const hero = useMemo(() => exampleDesigns[0] ?? defaultDesign('Classic solitaire'), []);
  const featured = useMemo(() => pickFeatured(exampleDesigns, 6), []);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const counts: [number, string][] = [
    [listModels('cut').length, 'cuts'],
    [listModels('head').length, 'heads'],
    [listModels('shank').length, 'shanks'],
    [listModels('band').length, 'band styles'],
    [listModels('gem').length, 'gemstones'],
    [listModels('metal').length, 'metals'],
  ];

  return (
    <main className="page home" data-testid="home">
      <section className="hm-hero" aria-labelledby="hm-title">
        <div className="hm-hero-text">
          <p className="hm-eyebrow">Engagement ring + wedding band designer</p>
          <h1 id="hm-title">Design the ring that is exactly yours</h1>
          <p className="hm-lead">
            Build an engagement ring and a matching band from interchangeable parts, see it in 3D, and save or compare your favourites. Free, in your browser, no sign-up.
          </p>
          <div className="hm-cta">
            <a className="btn primary" href="#/build" data-testid="cta-build">
              Start building
            </a>
            <a className="btn" href="#/gallery" data-testid="cta-gallery">
              Browse gallery
            </a>
          </div>
          <p className="muted hm-counts" data-testid="component-counts">
            {counts.map(([n, l]) => `${n} ${l}`).join(' · ')}
          </p>
        </div>
        <div className="hm-hero-view">
          <DesignViewer design={hero} view={hero.band ? 'set' : 'ring'} autoRotate={!reduce} refit />
          <p className="muted hm-caption">{hero.name}. Drag to rotate, scroll to zoom.</p>
        </div>
      </section>

      <section aria-labelledby="hm-feat" className="hm-section">
        <h2 id="hm-feat" className="sr-only">
          Features
        </h2>
        <div className="hm-features">
          {FEATURES.map(([t, d]) => (
            <div className="card" key={t}>
              <h3>{t}</h3>
              <p className="muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="hm-how" className="hm-section">
        <h2 id="hm-how">How it works</h2>
        <ol className="hm-steps">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="card">
              <span className="hm-step-n" aria-hidden="true">
                {i + 1}
              </span>
              <h3>{t}</h3>
              <p className="muted">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="hm-ex" className="hm-section">
        <div className="hm-row-head">
          <h2 id="hm-ex">Featured examples</h2>
          <a href="#/gallery">See all examples →</a>
        </div>
        {featured.length === 0 ? (
          <p className="muted" data-testid="featured-empty">
            Example rings are on their way. In the meantime, <a href="#/build">start from scratch</a>.
          </p>
        ) : (
          <div className="grid hm-featured" data-testid="featured">
            {featured.map((d) => (
              <DesignCard key={d.id} design={d} href={`/gallery/${encodeURIComponent(d.id)}`} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
