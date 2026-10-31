import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { cuts } from '@/models/data/cuts';
import { dimsFromCarat, type StoneDims } from '@/models/stoneMath';
import type { CutModel, GemModel } from '@/models/types';
import { stoneBuilders } from '../builders';
import type { BuiltStone } from '../types';
import {
  STONE_BUILDER_KEYS,
  buildStoneByCut,
  buildStoneUncached,
  clearStoneCache,
  shoelaceXZ,
} from './index';

const VOCAB_CUTS = [
  'round-brilliant',
  'princess',
  'cushion',
  'oval',
  'emerald-cut',
  'asscher',
  'radiant',
  'pear',
  'marquise',
  'heart',
  'trillion',
  'baguette',
  'rose-cut',
  'old-european',
  'old-mine',
  'hexagon',
  'kite',
  'shield',
  'cabochon',
];

const diamondLike: GemModel = {
  kind: 'gem',
  id: 'stub',
  name: 'Stub',
  summary: '',
  description: '',
  tags: [],
  lab: false,
  ior: 2.42,
  mohs: 10,
  density: 3.52,
  dispersion: 0.044,
  colors: [{ id: 'white', name: 'White', hex: '#ffffff' }],
  defaultColor: 'white',
  transparency: 'transparent',
  durability: 5,
  priceHintPerCaratUsd: [1, 2],
};

const cut = (id: string): CutModel => {
  const c = cuts.find((x) => x.id === id);
  if (!c) throw new Error(id);
  return c;
};

interface Stats {
  tris: number;
  min: [number, number, number];
  max: [number, number, number];
  volume: number;
  /** directed edges without a matching reverse edge (0 = closed, consistently wound) */
  openEdges: number;
  badNormals: number;
  /** flat faces whose stored normal disagrees with the winding */
  windingMismatch: number;
}

function stats(g: THREE.BufferGeometry, smooth: boolean): Stats {
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let volume = 0;
  let badNormals = 0;
  let windingMismatch = 0;
  const edges = new Map<string, number>();
  const key = (i: number) =>
    `${Math.round(p.getX(i) * 1e4) + 0},${Math.round(p.getY(i) * 1e4) + 0},${Math.round(p.getZ(i) * 1e4) + 0}`;
  for (let i = 0; i < p.count; i++) {
    const v = [p.getX(i), p.getY(i), p.getZ(i)];
    v.forEach((c, k) => {
      if (!Number.isFinite(c)) throw new Error('non-finite position');
      min[k] = Math.min(min[k], c);
      max[k] = Math.max(max[k], c);
    });
    const nl = Math.hypot(n.getX(i), n.getY(i), n.getZ(i));
    if (!Number.isFinite(nl) || Math.abs(nl - 1) > 1e-3) badNormals++;
  }
  for (let t = 0; t < p.count; t += 3) {
    const a = [p.getX(t), p.getY(t), p.getZ(t)];
    const b = [p.getX(t + 1), p.getY(t + 1), p.getZ(t + 1)];
    const c = [p.getX(t + 2), p.getY(t + 2), p.getZ(t + 2)];
    volume +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) -
        a[1] * (b[0] * c[2] - b[2] * c[0]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const dot = cr[0] * n.getX(t) + cr[1] * n.getY(t) + cr[2] * n.getZ(t);
    if (smooth ? dot < -1e-9 : dot <= 0) windingMismatch++;
    const ks = [key(t), key(t + 1), key(t + 2)];
    for (let e = 0; e < 3; e++) {
      const fwd = `${ks[e]}>${ks[(e + 1) % 3]}`;
      const rev = `${ks[(e + 1) % 3]}>${ks[e]}`;
      if (ks[e] === ks[(e + 1) % 3]) continue;
      const r = edges.get(rev) ?? 0;
      if (r > 0) edges.set(rev, r - 1);
      else edges.set(fwd, (edges.get(fwd) ?? 0) + 1);
    }
  }
  let openEdges = 0;
  edges.forEach((c) => (openEdges += c));
  return { tris: p.count / 3, min, max, volume, openEdges, badNormals, windingMismatch };
}

function check(c: CutModel, s: BuiltStone, dims: StoneDims, detail: 'full' | 'low') {
  const st = stats(s.geometry, c.facetStyle === 'smooth');
  const label = `${c.id}/${detail}`;
  expect(st.tris, label).toBeGreaterThan(0);
  expect(s.geometry.index, label).toBeNull();
  expect(st.badNormals, `${label} bad normals`).toBe(0);
  expect(st.windingMismatch, `${label} winding`).toBe(0);
  expect(st.openEdges, `${label} open edges`).toBe(0);
  expect(st.volume, `${label} volume`).toBeGreaterThan(0);
  // bounding box vs declared dims
  const sx = st.max[0] - st.min[0];
  const sz = st.max[2] - st.min[2];
  const tol = detail === 'full' ? 0.03 : 0.2;
  expect(sx / dims.length, `${label} length`).toBeGreaterThan(1 - tol);
  expect(sx / dims.length, `${label} length`).toBeLessThan(1.01);
  expect(sz / dims.width, `${label} width`).toBeGreaterThan(1 - tol);
  expect(sz / dims.width, `${label} width`).toBeLessThan(1.01);
  expect(st.max[1]).toBeCloseTo(s.crownHeight, 4);
  expect(st.min[1]).toBeCloseTo(-s.pavilionDepth, 4);
  expect(s.crownHeight + s.pavilionDepth).toBeCloseTo(dims.depth, 4);
  expect(s.girdleThickness / dims.width).toBeGreaterThan(0.004);
  expect(s.girdleThickness / dims.width).toBeLessThan(0.1);
  // outline: CCW from +Y, valid corners
  expect(shoelaceXZ(s.outline.points), `${label} outline ccw`).toBeLessThan(0);
  for (const k of s.outline.corners) expect(k >= 0 && k < s.outline.points.length, label).toBe(true);
  return st;
}

describe('cut data', () => {
  it('covers every vocabulary cut exactly once', () => {
    expect(cuts.map((c) => c.id).sort()).toEqual([...VOCAB_CUTS].sort());
  });
  it.each(cuts.map((c) => [c.id, c] as const))('%s is well formed', (_id, c) => {
    expect(STONE_BUILDER_KEYS as readonly string[]).toContain(c.builder);
    expect(stoneBuilders.has(c.builder)).toBe(true);
    expect(c.summary.length).toBeGreaterThan(10);
    const words = c.description.split(/\s+/).filter(Boolean).length;
    expect(words).toBeGreaterThan(40);
    expect(words).toBeLessThan(110);
    expect(c.description.split('\n\n').length).toBeGreaterThanOrEqual(2);
    expect(c.pros?.length ?? 0).toBeGreaterThan(0);
    expect(c.cons?.length ?? 0).toBeGreaterThan(0);
    expect(c.bestFor?.length ?? 0).toBeGreaterThan(0);
    expect(c.tags.length).toBeGreaterThan(0);
    expect(c.aspectRange[0]).toBeLessThanOrEqual(c.defaultAspect);
    expect(c.aspectRange[1]).toBeGreaterThanOrEqual(c.defaultAspect);
    expect(c.defaultDepthPct).toBeGreaterThan(0.3);
    expect(c.defaultDepthPct).toBeLessThan(0.85);
    expect(c.volumeFactor).toBeGreaterThan(0.004);
    expect(c.volumeFactor).toBeLessThan(0.01);
  });
});

describe('carat math', () => {
  it('1 ct round brilliant diamond is about 6.4-6.5 mm', () => {
    const d = dimsFromCarat(cut('round-brilliant'), diamondLike, { carat: 1 });
    expect(d.length).toBeGreaterThan(6.3);
    expect(d.length).toBeLessThan(6.6);
    expect(d.width).toBeCloseTo(d.length, 6);
    expect(d.depth / d.width).toBeCloseTo(0.615, 6);
  });
  it('size grows monotonically with carat for every cut', () => {
    for (const c of cuts) {
      let prev = 0;
      for (const ct of [0.1, 0.25, 0.5, 1, 1.5, 2, 3, 5]) {
        const d = dimsFromCarat(c, diamondLike, { carat: ct });
        expect(d.length).toBeGreaterThan(prev);
        prev = d.length;
      }
    }
  });
});

describe.each(cuts.map((c) => [c.id, c] as const))('stone %s', (_id, c) => {
  const dims = dimsFromCarat(c, diamondLike, { carat: 1 });
  const full = buildStoneUncached(c, dims, { detail: 'full' });
  const low = buildStoneUncached(c, dims, { detail: 'low' });

  it('full detail is a closed, outward, bounded solid within budget', () => {
    const st = check(c, full, dims, 'full');
    expect(st.tris).toBeLessThan(1200);
    // geometry volume agrees with the carat constant within 25% (V = 200 ct / SG, ct = vf L W D SG / 3.52)
    const expected = (200 * c.volumeFactor * dims.length * dims.width * dims.depth) / 3.52;
    expect(st.volume / expected, `${c.id} volume ratio`).toBeGreaterThan(0.75);
    expect(st.volume / expected, `${c.id} volume ratio`).toBeLessThan(1.25);
  });

  it('low detail is cheap and still valid', () => {
    const st = check(c, low, dims, 'low');
    expect(st.tris).toBeLessThan(c.id === 'round-brilliant' ? 49 : 120);
    expect(st.tris).toBeLessThan(stats(full.geometry, c.facetStyle === 'smooth').tris);
  });

  it('works at melee and large sizes and across its aspect range', () => {
    for (const s of [
      { length: 1.3 * c.defaultAspect, width: 1.3, depth: 1.3 * c.defaultDepthPct },
      dimsFromCarat(c, diamondLike, { carat: 4, aspect: c.aspectRange[0] }),
      dimsFromCarat(c, diamondLike, { carat: 2, aspect: c.aspectRange[1] }),
    ]) {
      check(c, buildStoneUncached(c, s, { detail: 'full' }), s, 'full');
      check(c, buildStoneUncached(c, s, { detail: 'low' }), s, 'low');
    }
  });

  it('has the expected number of outline corners', () => {
    const expected: Record<string, number> = {
      princess: 4,
      cushion: 4,
      'emerald-cut': 4,
      asscher: 4,
      radiant: 4,
      pear: 1,
      marquise: 2,
      heart: 2,
      trillion: 3,
      baguette: 4,
      'old-mine': 4,
      hexagon: 6,
      kite: 4,
      shield: 5,
    };
    expect(full.outline.corners.length).toBe(expected[c.id] ?? 0);
    expect(low.outline.corners.length).toBe(expected[c.id] ?? 0);
  });
});

describe('cut-specific invariants', () => {
  const build = (id: string, ct = 1) => {
    const c = cut(id);
    const dims = dimsFromCarat(c, diamondLike, { carat: ct });
    return { c, dims, s: buildStoneUncached(c, dims, {}) };
  };
  const ys = (s: BuiltStone) => {
    const p = s.geometry.getAttribute('position');
    return Array.from({ length: p.count }, (_, i) => [p.getX(i), p.getY(i), p.getZ(i)] as const);
  };

  it('round brilliant: realistic proportions, pointed culet, 8-fold table', () => {
    const { dims, s } = build('round-brilliant');
    expect(s.crownHeight / dims.width).toBeCloseTo(0.15, 2);
    expect(s.girdleThickness / dims.width).toBeCloseTo(0.02, 3);
    const tableVerts = ys(s).filter((v) => Math.abs(v[1] - s.crownHeight) < 1e-6);
    const tableWidth = Math.max(...tableVerts.map((v) => v[2])) - Math.min(...tableVerts.map((v) => v[2]));
    expect(tableWidth / dims.width).toBeGreaterThan(0.5);
    expect(tableWidth / dims.width).toBeLessThan(0.6);
    const culet = ys(s).filter((v) => Math.abs(v[1] + s.pavilionDepth) < 1e-6);
    expect(Math.max(...culet.map((v) => Math.hypot(v[0], v[2])))).toBeLessThan(1e-6);
  });

  it('princess / trillion / marquise / pear corners sit on the outline extremes', () => {
    const p = build('princess');
    for (const k of p.s.outline.corners) {
      const [x, z] = p.s.outline.points[k];
      expect(Math.abs(Math.abs(x) - p.dims.length / 2)).toBeLessThan(1e-3);
      expect(Math.abs(Math.abs(z) - p.dims.width / 2)).toBeLessThan(1e-3);
    }
    const m = build('marquise');
    const mx = m.s.outline.corners.map((k) => m.s.outline.points[k][0]).sort((a, b) => a - b);
    expect(mx[0]).toBeCloseTo(-m.dims.length / 2, 3);
    expect(mx[1]).toBeCloseTo(m.dims.length / 2, 3);
    const pr = build('pear');
    expect(pr.s.outline.points[pr.s.outline.corners[0]][0]).toBeCloseTo(pr.dims.length / 2, 3);
    const tr = build('trillion');
    expect(new Set(tr.s.outline.corners).size).toBe(3);
  });

  it('heart: cleft is indented, point is at +X', () => {
    const { dims, s } = build('heart');
    const xs = s.outline.corners.map((k) => s.outline.points[k][0]).sort((a, b) => a - b);
    expect(xs[1]).toBeCloseTo(dims.length / 2, 3); // point
    expect(xs[0]).toBeGreaterThan(-dims.length / 2 + 0.1 * dims.length); // cleft dips inside the lobes
  });

  it('emerald cut: pavilion closes on a keel of length L - W; asscher on a point', () => {
    const e = build('emerald-cut');
    const keel = ys(e.s).filter((v) => Math.abs(v[1] + e.s.pavilionDepth) < 1e-6);
    const span = Math.max(...keel.map((v) => v[0])) - Math.min(...keel.map((v) => v[0]));
    expect(span).toBeCloseTo(e.dims.length - e.dims.width, 3);
    const a = build('asscher');
    const pt = ys(a.s).filter((v) => Math.abs(v[1] + a.s.pavilionDepth) < 1e-6);
    expect(Math.max(...pt.map((v) => Math.abs(v[0]) + Math.abs(v[2])))).toBeLessThan(1e-4);
  });

  it('rose cut: flat base and a single apex', () => {
    const { s } = build('rose-cut');
    const v = ys(s);
    expect(
      v.filter((q) => Math.abs(q[1] - s.crownHeight) < 1e-6).every((q) => Math.hypot(q[0], q[2]) < 1e-6),
    ).toBe(true);
    expect(s.pavilionDepth).toBeCloseTo(s.girdleThickness / 2, 6);
  });

  it('cabochon: smooth dome normals (many distinct directions)', () => {
    const { s } = build('cabochon');
    const n = s.geometry.getAttribute('normal');
    const set = new Set<string>();
    for (let i = 0; i < n.count; i++)
      set.add(`${n.getX(i).toFixed(3)},${n.getY(i).toFixed(3)},${n.getZ(i).toFixed(3)}`);
    expect(set.size).toBeGreaterThan(300);
  });

  it('step cuts have planar-looking rows: every face normal of the emerald crown has non-negative y', () => {
    const { s } = build('emerald-cut');
    const p = s.geometry.getAttribute('position');
    const n = s.geometry.getAttribute('normal');
    for (let i = 0; i < p.count; i++) if (p.getY(i) > s.girdleThickness) expect(n.getY(i)).toBeGreaterThan(0);
  });
});

describe('buildStoneByCut cache', () => {
  it('memoises by cut id, rounded dims and detail', () => {
    clearStoneCache();
    const c = cut('oval');
    const a = buildStoneByCut(c, { length: 8.001, width: 6, depth: 3.6 });
    const b = buildStoneByCut(c, { length: 8.002, width: 6, depth: 3.6 });
    const l = buildStoneByCut(c, { length: 8.001, width: 6, depth: 3.6 }, { detail: 'low' });
    expect(a).toBe(b);
    expect(l).not.toBe(a);
  });
  it('throws for an unknown builder', () => {
    expect(() =>
      buildStoneUncached({ ...cut('oval'), builder: 'nope' }, { length: 1, width: 1, depth: 1 }),
    ).toThrow();
  });
});
