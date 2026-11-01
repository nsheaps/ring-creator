import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { headBuilders } from '../builders';
import type { Part } from '../types';
import { heads } from '@/models/data/heads';
import './index';
import { cleanOutline, prongSites, signedVolume } from './common';
import { STUB_CUTS, stubCtx, stubStone } from './testStub';

const TRI_BUDGET = 60000;
const MULTI = new Set(['three-stone', 'five-stone', 'toi-et-moi', 'bypass-head', 'cluster-flank']);

function stats(parts: Part[]) {
  const box = new THREE.Box3();
  let tris = 0;
  for (const p of parts) {
    const pos = p.geometry.getAttribute('position');
    expect(pos, `${p.label} has positions`).toBeTruthy();
    expect(p.geometry.getIndex(), `${p.label} non-indexed`).toBeNull();
    const arr = pos.array as ArrayLike<number>;
    for (let i = 0; i < arr.length; i++)
      if (!Number.isFinite(arr[i])) throw new Error(`${p.label}: non-finite position`);
    const n = p.geometry.getAttribute('normal');
    expect(n, `${p.label} has normals`).toBeTruthy();
    const na = n.array as ArrayLike<number>;
    for (let i = 0; i < na.length; i++)
      if (!Number.isFinite(na[i])) throw new Error(`${p.label}: NaN normal`);
    tris += pos.count / 3;
    p.geometry.computeBoundingBox();
    if (p.geometry.boundingBox) box.union(p.geometry.boundingBox);
  }
  return { box, tris };
}

const byId = new Map(heads.map((h) => [h.id, h]));
const VOCAB = [
  'solitaire-4-prong',
  'solitaire-6-prong',
  '3-prong',
  'double-claw',
  'basket',
  'cathedral-head',
  'v-prong',
  'bezel-full',
  'bezel-half',
  'halo-round',
  'halo-cushion',
  'halo-oval',
  'hidden-halo',
  'double-halo',
  'three-stone',
  'five-stone',
  'cluster',
  'trellis',
  'tension',
  'flush-gypsy',
  'split-prong',
  'compass',
  'vintage-filigree',
  'toi-et-moi',
  'bypass-head',
  'bezel-polygon',
  'bezel-cushion',
  'halo-hexagon',
  'deco-plaque',
  'cluster-flank',
  'tension-bypass',
  'leaf-vine-bypass',
];

describe('head models', () => {
  it('cover every head id in the vocabulary', () => {
    expect(heads.map((h) => h.id).sort()).toEqual([...VOCAB].sort());
  });
  for (const h of heads) {
    it(`${h.id}: data is complete`, () => {
      expect(h.kind).toBe('head');
      expect(headBuilders.has(h.builder)).toBe(true);
      expect(h.summary.length).toBeGreaterThan(10);
      const words = h.description.split(/\s+/).filter(Boolean).length;
      expect(words).toBeGreaterThan(30);
      expect(words).toBeLessThan(110);
      expect(h.pros?.length).toBeGreaterThan(0);
      expect(h.cons?.length).toBeGreaterThan(0);
      expect(h.bestFor?.length).toBeGreaterThan(0);
      for (const key of Object.keys(h.params))
        expect(
          h.controls.some((c) => c.key === key),
          `${h.id} control for ${key}`,
        ).toBe(true);
      for (const c of h.controls) {
        expect(key(h.params, c.key), `${h.id} default for ${c.key}`).toBe(true);
        if (c.type === 'number') {
          const v = h.params[c.key] as number;
          expect(v).toBeGreaterThanOrEqual(c.min);
          expect(v).toBeLessThanOrEqual(c.max);
        }
        if (c.type === 'select') expect(c.options.some((o) => o.value === h.params[c.key])).toBe(true);
      }
      for (const r of h.related ?? []) expect(r).not.toBe(h.id);
    });
  }
});

function key(p: Record<string, unknown>, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(p, k);
}

describe('head builders', () => {
  for (const id of VOCAB) {
    describe(id, () => {
      const model = byId.get(id);
      const params = model?.params ?? {};
      for (const cut of STUB_CUTS) {
        for (const baseDrop of [1.2, 4.5]) {
          it(`${cut}, baseDrop ${baseDrop}`, () => {
            const ctx = stubCtx({ cut, baseDrop, params, bandAxis: cut === 'oval' ? [0, 1] : [1, 0] });
            const fn = headBuilders.get(model?.builder ?? id);
            expect(fn).toBeTruthy();
            if (!fn) return;
            const parts = fn(ctx);
            expect(parts.length).toBeGreaterThan(0);
            const metal = parts.filter((p) => p.slot === 'head-metal');
            expect(metal.length).toBeGreaterThan(0);
            const { box, tris } = stats(parts);
            expect(tris).toBeGreaterThan(20);
            expect(tris).toBeLessThan(TRI_BUDGET);
            const L = Math.max(ctx.center.dims.length, ctx.center.dims.width);
            // reaches the shank seat
            const m = stats(metal).box;
            expect(m.min.y).toBeLessThanOrEqual(-baseDrop + 0.15);
            if (MULTI.has(id))
              // side stones follow the curve of the shank: they may wrap down it (a pair of 12.8 mm east-west marquises
              // reaches well down the shoulder), but never past the ring's equator
              expect(box.min.y).toBeGreaterThan(-baseDrop - (ctx.innerRadius + 1.8) * 0.9);
            else
              expect(box.min.y).toBeGreaterThan(
                -Math.max(baseDrop, ctx.center.built.pavilionDepth * 1.2) - 4,
              );
            expect(box.max.y).toBeLessThan(ctx.center.built.crownHeight + 2);
            expect(box.max.y).toBeGreaterThan(0);
            const lim = L * 2.6 + 6;
            for (const v of [box.min.x, box.max.x, box.min.z, box.max.z])
              expect(Math.abs(v)).toBeLessThan(lim);
            // the metal wraps around the stone: it extends on both sides of the girdle centre
            expect(m.min.x).toBeLessThan(0);
            expect(m.max.x).toBeGreaterThan(0);
            // outward winding overall
            for (const p of metal) expect(signedVolume(p.geometry)).toBeGreaterThan(0);
          });
        }
      }
    });
  }
});

describe('specific invariants', () => {
  const build = (id: string, o: Parameters<typeof stubCtx>[0] = {}) => {
    const model = byId.get(id);
    const fn = headBuilders.get(model?.builder ?? id);
    if (!fn) throw new Error(id);
    return fn(stubCtx({ params: model?.params ?? {}, ...o }));
  };
  const accentTris = (parts: Part[]) =>
    parts
      .filter((p) => p.slot === 'accent-stone')
      .reduce((s, p) => s + p.geometry.getAttribute('position').count / 3, 0);
  const accentBox = (parts: Part[]) => stats(parts.filter((p) => p.slot === 'accent-stone')).box;

  it('prong heads add no stones; halos, clusters and multi-stone heads do', () => {
    for (const id of ['solitaire-4-prong', 'basket', 'bezel-full', 'tension', 'compass'])
      expect(build(id).some((p) => p.slot === 'accent-stone')).toBe(false);
    for (const id of [
      'halo-round',
      'hidden-halo',
      'double-halo',
      'cluster',
      'three-stone',
      'five-stone',
      'toi-et-moi',
      'bypass-head',
    ])
      expect(accentTris(build(id))).toBeGreaterThan(0);
  });

  it('a double halo has more melee than a single halo, and a bigger footprint', () => {
    const one = build('halo-round');
    const two = build('double-halo');
    expect(accentTris(two)).toBeGreaterThan(accentTris(one) * 1.5);
    expect(accentBox(two).max.x).toBeGreaterThan(accentBox(one).max.x + 0.8);
  });

  it('halo melee sit outside the centre stone, hidden halo melee sit under the girdle and inside it', () => {
    const ctx = stubCtx();
    const halo = accentBox(build('halo-round'));
    expect(halo.max.x).toBeGreaterThan(ctx.center.dims.length / 2 + 0.5);
    const hidden = accentBox(build('hidden-halo'));
    expect(hidden.max.y).toBeLessThan(0.1);
    expect(hidden.max.x).toBeLessThan(ctx.center.dims.length / 2 + 1.2);
  });

  it('halo melee follow the outline of a marquise (long halo)', () => {
    const b = accentBox(build('halo-round', { cut: 'marquise' }));
    expect(b.max.x - b.min.x).toBeGreaterThan((b.max.z - b.min.z) * 1.4);
  });

  it('three-stone side stones lie along the band axis', () => {
    const ew = accentBox(build('three-stone', { bandAxis: [1, 0] }));
    expect(ew.max.x - ew.min.x).toBeGreaterThan((ew.max.z - ew.min.z) * 2);
    const ns = accentBox(build('three-stone', { bandAxis: [0, 1] }));
    expect(ns.max.z - ns.min.z).toBeGreaterThan((ns.max.x - ns.min.x) * 2);
  });

  it('five-stone reaches further along the band than three-stone, and side-stone ratio grows the stones', () => {
    expect(accentBox(build('five-stone')).max.x).toBeGreaterThan(accentBox(build('three-stone')).max.x + 1);
    const small = accentBox(
      build('three-stone', { params: { ...byId.get('three-stone')?.params, sideRatio: 0.4 } }),
    );
    const big = accentBox(
      build('three-stone', { params: { ...byId.get('three-stone')?.params, sideRatio: 0.9 } }),
    );
    expect(big.max.z - big.min.z).toBeGreaterThan(small.max.z - small.min.z);
  });

  it('toi-et-moi puts the second stone on one side only', () => {
    const b = accentBox(build('toi-et-moi'));
    expect(b.min.x).toBeGreaterThan(0);
  });

  it('tension jaws sit either side along the band, not across it', () => {
    const m = stats(build('tension')).box;
    expect(m.max.x).toBeGreaterThan(3.2 + 1);
    expect(m.max.z).toBeLessThan(3.2);
  });

  it('half bezel leaves the sides across the band open; a full bezel does not', () => {
    const W = stubCtx().center.dims.width;
    const sideMetal = (ps: Part[]) => {
      let n = 0;
      for (const p of ps.filter((q) => q.slot === 'head-metal')) {
        const a = p.geometry.getAttribute('position');
        for (let i = 0; i < a.count; i++) if (a.getY(i) > 0 && Math.abs(a.getX(i)) < W * 0.15) n++;
      }
      return n;
    };
    expect(sideMetal(build('bezel-half'))).toBe(0);
    expect(sideMetal(build('bezel-full'))).toBeGreaterThan(0);
  });

  it('full bezel is a thin, low collar: lip just above the girdle, wall no thicker than ~0.5 mm', () => {
    const ctx = stubCtx();
    const stone = ctx.center.built;
    const o = cleanOutline(stone.outline);
    const halfW = Math.min(
      ...[0, Math.PI / 2].map((a) => Math.max(...o.pts.map(([x, z]) => x * Math.cos(a) + z * Math.sin(a)))),
    );
    const box = stats(build('bezel-full')).box;
    expect(box.max.y).toBeLessThan(stone.girdleThickness / 2 + stone.crownHeight * 0.3 + 0.15);
    // across the band (z), the collar sticks out past the girdle by at most the wall thickness
    expect(box.max.z - halfW).toBeLessThan(0.6);
    // below the collar the metal tapers in with the pavilion instead of dropping straight down like a bucket
    const yLow = -stone.girdleThickness / 2 - stone.pavilionDepth * 0.5;
    let zLow = 0;
    for (const p of build('bezel-full').filter((q) => q.slot === 'head-metal')) {
      const a = p.geometry.getAttribute('position');
      for (let i = 0; i < a.count; i++) if (a.getY(i) < yLow) zLow = Math.max(zLow, Math.abs(a.getZ(i)));
    }
    expect(zLow).toBeLessThan(halfW * 0.9);
  });

  it('flush setting keeps the metal close to the girdle (no prong tips above the crown)', () => {
    const ctx = stubCtx();
    expect(stats(build('flush-gypsy')).box.max.y).toBeLessThan(ctx.center.built.crownHeight * 0.5);
  });

  it('cathedral arches reach further along the band than the plain solitaire', () => {
    expect(stats(build('cathedral-head')).box.max.x).toBeGreaterThan(
      stats(build('solitaire-4-prong')).box.max.x + 0.5,
    );
  });

  it('prong styles all build', () => {
    for (const style of ['round', 'claw', 'tab', 'v']) {
      const parts = build('solitaire-4-prong', {
        params: { ...byId.get('solitaire-4-prong')?.params, prongStyle: style },
      });
      expect(stats(parts).tris).toBeGreaterThan(100);
    }
  });

  it('halo shapes all build for a princess', () => {
    for (const shape of ['follow', 'round', 'cushion', 'oval']) {
      const parts = build('halo-round', {
        cut: 'princess',
        params: { ...byId.get('halo-round')?.params, haloShape: shape },
      });
      expect(accentTris(parts)).toBeGreaterThan(0);
    }
  });

  it('accent cut may be non-round (baguette-like emerald accents)', () => {
    expect(accentTris(build('halo-round', { accentCut: 'emerald-cut' }))).toBeGreaterThan(0);
    expect(accentTris(build('three-stone', { accentCut: 'pear' }))).toBeGreaterThan(0);
  });
});

describe('prong sites', () => {
  it('distributes evenly by arc length on a round stone', () => {
    const o = cleanOutline(stubStone('round-brilliant', { length: 6, width: 6, depth: 3.7 }).outline);
    const s = prongSites(o, { count: 4 }).sort((a, b) => a - b);
    for (let i = 1; i < 4; i++) expect(s[i] - s[i - 1]).toBeCloseTo(o.perimeter / 4, 1);
  });
  it('starts at the corners when the cut has them', () => {
    const o = cleanOutline(stubStone('princess', { length: 6, width: 6, depth: 4 }).outline);
    const corners = o.corners.map((c) => o.cum[c]).sort((a, b) => a - b);
    expect(prongSites(o, { count: 4 }).sort((a, b) => a - b)).toEqual(corners);
    expect(prongSites(o, { count: 8 }).length).toBe(8);
    const pear = cleanOutline(stubStone('pear', { length: 9, width: 6, depth: 3.6 }).outline);
    const ps = prongSites(pear, { count: 5 });
    expect(ps).toContain(pear.cum[pear.corners[0]]);
    expect(ps.length).toBe(5);
  });
});
