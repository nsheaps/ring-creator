import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { StoneDims } from '@/models/stoneMath';
import type { CutModel, GemModel } from '@/models/types';
import { shanks } from '@/models/data/shanks';
import { shankBuilders } from '../builders';
import type { BuiltStone, Part, ShankCtx } from '../types';
import './index';
import { bandSection, signedVolume } from './common';
import { detachedIslands } from './connectivity';

const TRI_BUDGET = 60000;
const VOCAB = [
  'plain-round',
  'plain-flat',
  'knife-edge',
  'tapered',
  'cathedral',
  'split',
  'pave',
  'channel',
  'twisted',
  'bypass',
  'vintage-filigree',
  'milgrain',
  'crossover',
  'wide',
  'dainty',
  'hammered',
  'braided',
  'leaf-vine',
  'twig',
  'comfort-fit',
  'beaded',
];

// ---------- stubs (no dependency on the stone builders) ----------
function stubCut(id: string, aspect = 1): CutModel {
  return {
    kind: 'cut',
    id,
    name: id,
    summary: '',
    description: '',
    tags: [],
    builder: id,
    params: {},
    volumeFactor: 0.0061,
    defaultAspect: aspect,
    aspectRange: [1, 3],
    defaultDepthPct: 0.61,
    facetStyle: 'brilliant',
    facetCount: 57,
    vulnerableCorners: 0,
  };
}
const gem: GemModel = {
  kind: 'gem',
  id: 'diamond',
  name: 'Diamond',
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
  priceHintPerCaratUsd: [1000, 10000],
};
/** Octagonal faceted stone, girdle at y = 0. */
function stubStone(d: StoneDims): BuiltStone {
  const pos: number[] = [];
  const n = 8;
  const ch = d.width * 0.16;
  const pd = Math.max(0.1, d.depth - ch);
  const pt = (i: number, s: number, y: number) => [
    (d.length / 2) * s * Math.cos((i / n) * Math.PI * 2),
    y,
    (d.width / 2) * s * Math.sin((i / n) * Math.PI * 2),
  ];
  for (let i = 0; i < n; i++) {
    const a = pt(i, 1, 0);
    const b = pt(i + 1, 1, 0);
    const ta = pt(i, 0.55, ch);
    const tb = pt(i + 1, 0.55, ch);
    pos.push(...a, ...ta, ...b, ...b, ...ta, ...tb, 0, ch, 0, ...tb, ...ta, ...a, ...b, 0, -pd, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return {
    geometry: g,
    outline: { points: [], corners: [] },
    crownHeight: ch,
    pavilionDepth: pd,
    girdleThickness: 0.02,
  };
}
function stubCtx(
  params: ShankCtx['params'],
  o: { R?: number; accentCut?: string; accentAspect?: number; accentSize?: number } = {},
): ShankCtx {
  const W = 6.4;
  const cut = stubCut('round-brilliant');
  const dims = { length: W, width: W, depth: W * 0.61 };
  return {
    innerRadius: o.R ?? 8.5,
    center: { gem, colorHex: '#fff', cut, dims, carat: 1, built: stubStone(dims) },
    accent: {
      gem,
      colorHex: '#fff',
      cut: stubCut(o.accentCut ?? 'round-brilliant', o.accentAspect ?? 1),
      sizeMm: o.accentSize ?? 1.3,
    },
    params,
    headHalfAlongBand: W / 2 + 0.9,
    headHalfAlongFinger: W / 2 + 0.9,
    stone: (_id, d) => stubStone(d),
  };
}

function stats(parts: Part[]) {
  const box = new THREE.Box3();
  let tris = 0;
  let minRadial = Infinity;
  let maxRadial = 0;
  let maxZ = 0;
  for (const p of parts) {
    const pos = p.geometry.getAttribute('position');
    expect(pos, `${p.label} positions`).toBeTruthy();
    expect(pos.count).toBeGreaterThan(0);
    expect(p.geometry.getIndex(), `${p.label} non-indexed`).toBeNull();
    const arr = pos.array as ArrayLike<number>;
    for (let i = 0; i < arr.length; i += 3) {
      const [x, y, z] = [arr[i], arr[i + 1], arr[i + 2]];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z))
        throw new Error(`${p.label}: non-finite position`);
      const r = Math.hypot(x, y);
      if (p.slot === 'shank-metal') minRadial = Math.min(minRadial, r);
      maxRadial = Math.max(maxRadial, r);
      maxZ = Math.max(maxZ, Math.abs(z));
    }
    const nrm = p.geometry.getAttribute('normal');
    expect(nrm, `${p.label} normals`).toBeTruthy();
    const na = nrm.array as ArrayLike<number>;
    for (let i = 0; i < na.length; i++)
      if (!Number.isFinite(na[i])) throw new Error(`${p.label}: NaN normal`);
    tris += pos.count / 3;
    p.geometry.computeBoundingBox();
    if (p.geometry.boundingBox) box.union(p.geometry.boundingBox);
  }
  return { box, tris, minRadial, maxRadial, maxZ };
}

const byId = new Map(shanks.map((s) => [s.id, s]));
const has = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);

describe('shank models', () => {
  it('cover every shank id in the vocabulary', () => {
    expect(shanks.map((s) => s.id).sort()).toEqual([...VOCAB].sort());
  });
  for (const s of shanks) {
    it(`${s.id}: data is complete`, () => {
      expect(s.kind).toBe('shank');
      expect(shankBuilders.has(s.builder)).toBe(true);
      expect(s.summary.length).toBeGreaterThan(10);
      const words = s.description.split(/\s+/).filter(Boolean).length;
      expect(words).toBeGreaterThan(30);
      expect(words).toBeLessThan(110);
      expect(s.pros?.length).toBeGreaterThan(0);
      expect(s.cons?.length).toBeGreaterThan(0);
      expect(s.bestFor?.length).toBeGreaterThan(0);
      for (const key of Object.keys(s.params))
        expect(
          s.controls.some((c) => c.key === key),
          `${s.id} control for ${key}`,
        ).toBe(true);
      for (const c of s.controls) {
        expect(has(s.params, c.key), `${s.id} default for ${c.key}`).toBe(true);
        if (c.type === 'number') {
          const v = s.params[c.key] as number;
          expect(v).toBeGreaterThanOrEqual(c.min);
          expect(v).toBeLessThanOrEqual(c.max);
        }
      }
      for (const r of s.related ?? []) {
        expect(r).not.toBe(s.id);
        expect(byId.has(r), `${s.id} related ${r}`).toBe(true);
      }
      expect(s.hasStones).toBe(s.id === 'pave' || s.id === 'channel');
    });
  }
});

describe('connectivity check', () => {
  const res = () => {
    const r = shankBuilders.get('plain-round')?.(stubCtx({}));
    if (!r) throw new Error('plain-round');
    return r;
  };
  const band = () => res().parts[0].geometry;
  const top = res().seatY;
  const ball = (y: number) => new THREE.SphereGeometry(0.3, 8, 6).translate(0, y, 0);
  it('accepts a bead sunk into the band or just touching it', () => {
    expect(detachedIslands([band(), ball(top)])).toEqual([]);
    expect(detachedIslands([band(), ball(top + 0.3 + 0.03)])).toEqual([]);
  });
  it('flags a floating bead and a bead hanging off another floating one', () => {
    expect(detachedIslands([band(), ball(top + 0.5)])).toHaveLength(1);
    expect(detachedIslands([band(), ball(top + 3), ball(top + 3.4)])).toHaveLength(2);
  });
});

describe('section helper', () => {
  it('puts the lowest point exactly on R', () => {
    const sec = bandSection({ w: 2, t: 1.8, R: 8.5, outerExp: 2, innerExp: 3, split: 0.6 });
    expect(Math.min(...sec.map((p) => p[1]))).toBeCloseTo(8.5, 9);
    expect(Math.max(...sec.map((p) => p[1]))).toBeCloseTo(10.3, 9);
  });
});

describe('shank builders', () => {
  for (const id of VOCAB) {
    describe(id, () => {
      const model = byId.get(id);
      const params = model?.params ?? {};
      for (const R of [7.5, 8.5, 10]) {
        it(`builds a sane closed band at R=${R}`, () => {
          const fn = shankBuilders.get(id);
          expect(fn).toBeTruthy();
          if (!fn) return;
          const res = fn(stubCtx(params, { R }));
          expect(res.parts.length).toBeGreaterThan(0);
          expect(res.parts.some((p) => p.slot === 'shank-metal')).toBe(true);
          const st = stats(res.parts);
          expect(st.tris).toBeGreaterThan(100);
          expect(st.tris).toBeLessThan(TRI_BUDGET);
          expect(Math.abs(st.minRadial - R), `inner radius ${st.minRadial}`).toBeLessThan(0.05);
          expect(st.maxRadial).toBeLessThan(R + 8);
          expect(st.maxZ).toBeLessThanOrEqual(8);
          expect(res.seatY).toBeGreaterThan(R);
          expect(res.seatY).toBeLessThan(R + 3.5);
          expect(res.topWidth).toBeGreaterThan(0.8);
          expect(res.topWidth).toBeLessThan(10);
          // the band goes all the way round: metal near the bottom of the ring
          expect(st.box.min.y).toBeLessThan(-R + 0.01);
          for (const p of res.parts.filter((q) => q.slot === 'shank-metal'))
            expect(signedVolume(p.geometry), `${p.label} winds outward`).toBeGreaterThan(0);
          // the seat really is the top of the band: some metal reaches seatY near x = 0
          const metal = res.parts.filter((p) => p.slot === 'shank-metal');
          let topNear = -Infinity;
          for (const p of metal) {
            const a = p.geometry.getAttribute('position').array as ArrayLike<number>;
            for (let i = 0; i < a.length; i += 3)
              if (Math.abs(a[i]) < 0.4 && Math.abs(a[i + 2]) < 4) topNear = Math.max(topNear, a[i + 1]);
          }
          expect(topNear).toBeGreaterThan(res.seatY - 0.4);
        });
      }
      it('has no floating or detached metal (every piece fused to the band)', () => {
        const fn = shankBuilders.get(id);
        if (!fn) throw new Error('missing');
        for (const R of [7.5, 10]) {
          const metal = fn(stubCtx(params, { R })).parts.filter((q) => q.slot === 'shank-metal');
          const islands = detachedIslands(metal.map((q) => q.geometry));
          expect(islands, `R=${R}: ${JSON.stringify(islands.slice(0, 3))}`).toEqual([]);
        }
      });
      it('is deterministic', () => {
        const fn = shankBuilders.get(id);
        if (!fn) throw new Error('missing');
        const a = fn(stubCtx(params)).parts[0].geometry.getAttribute('position').array as Float32Array;
        const b = fn(stubCtx(params)).parts[0].geometry.getAttribute('position').array as Float32Array;
        expect(a.length).toBe(b.length);
        expect(Array.from(a.slice(0, 300))).toEqual(Array.from(b.slice(0, 300)));
      });
      it('responds to every number control at its extremes', () => {
        const fn = shankBuilders.get(id);
        if (!fn || !model) throw new Error('missing');
        for (const c of model.controls) {
          if (c.type !== 'number') continue;
          for (const v of [c.min, c.max]) {
            const res = fn(stubCtx({ ...params, [c.key]: v }));
            const st = stats(res.parts);
            expect(st.tris, `${c.key}=${v}`).toBeLessThan(TRI_BUDGET);
            expect(Math.abs(st.minRadial - 8.5), `${c.key}=${v} inner radius`).toBeLessThan(0.05);
          }
        }
      });
    });
  }
});

describe('model-specific invariants', () => {
  const build = (id: string, params: Record<string, number> = {}, o: Parameters<typeof stubCtx>[1] = {}) => {
    const fn = shankBuilders.get(id);
    if (!fn) throw new Error(id);
    return fn(stubCtx({ ...(byId.get(id)?.params ?? {}), ...params }, o));
  };
  for (const id of ['plain-round', 'plain-flat', 'comfort-fit', 'wide', 'tapered', 'dainty']) {
    it(`${id}: brushed and engraved surfaces are cut into the metal, within budget and seamless`, () => {
      const plain = stats(build(id, {}).parts);
      for (const surface of ['brushed', 'engraved']) {
        const fn = shankBuilders.get(id);
        if (!fn) throw new Error(id);
        const res = fn(stubCtx({ ...(byId.get(id)?.params ?? {}), surface }));
        const st = stats(res.parts);
        expect(st.tris, surface).toBeGreaterThan(plain.tris * 1.5);
        expect(st.tris, surface).toBeLessThan(TRI_BUDGET);
        expect(Math.abs(st.minRadial - 8.5), surface).toBeLessThan(0.05);
        // a cut never raises the surface
        expect(st.maxRadial, surface).toBeLessThanOrEqual(plain.maxRadial + 1e-3);
        expect(detachedIslands(res.parts.map((q) => q.geometry)), surface).toEqual([]);
        for (const q of res.parts) expect(signedVolume(q.geometry), surface).toBeGreaterThan(0);
      }
    });
  }
  it('plain, comfort-fit and dainty are clearly different sections', () => {
    const box = (id: string) => stats(build(id).parts).box;
    const bottomThick = (id: string) => {
      const a = build(id).parts[0].geometry.getAttribute('position').array as ArrayLike<number>;
      let lo = Infinity;
      for (let i = 0; i < a.length; i += 3)
        if (Math.abs(a[i]) < 0.3 && a[i + 1] < 0) lo = Math.min(lo, a[i + 1]);
      return -lo - 8.5;
    };
    // dainty is a fine wire: narrower and thinner than the plain shank
    expect(box('dainty').max.z * 2).toBeLessThan(1.6);
    expect(bottomThick('dainty')).toBeLessThan(bottomThick('plain-round') - 0.3);
    // comfort fit is visibly heavier than the plain shank
    expect(bottomThick('comfort-fit')).toBeGreaterThan(bottomThick('plain-round') + 0.3);
    expect(box('comfort-fit').max.z).toBeGreaterThan(box('plain-round').max.z + 0.1);
  });
  it('plain round has a flat inside; comfort fit a domed one', () => {
    const edgeLift = (id: string) => {
      const a = build(id).parts[0].geometry.getAttribute('position').array as ArrayLike<number>;
      const w = stats(build(id).parts).box.max.z;
      let lo = Infinity;
      for (let i = 0; i < a.length; i += 3)
        if (Math.abs(a[i + 2]) > w * 0.7 && a[i + 1] < -8 && Math.abs(a[i]) < 0.5)
          lo = Math.min(lo, Math.hypot(a[i], a[i + 1]));
      return lo - 8.5;
    };
    expect(edgeLift('plain-round')).toBeLessThan(0.08);
    expect(edgeLift('comfort-fit')).toBeGreaterThan(0.2);
  });
  it('leaf-vine leaves lie on the band: nothing stands far off the surface on the shoulders', () => {
    const res = build('leaf-vine');
    const a = res.parts[0].geometry.getAttribute('position').array as ArrayLike<number>;
    // band: R 8.5, thickness <= 1.8 (+6 % noise); wander 0.3; width <= 2.0 (+12 %)
    for (let i = 0; i < a.length; i += 3) {
      expect(Math.hypot(a[i], a[i + 1])).toBeLessThan(8.5 + 1.8 * 1.06 + 0.45);
      expect(Math.abs(a[i + 2])).toBeLessThan(1.0 * 1.12 + 0.3 + 0.45);
    }
  });
  it('tapered is wider at the top than at the bottom', () => {
    const res = build('tapered');
    const a = res.parts[0].geometry.getAttribute('position').array as ArrayLike<number>;
    let top = 0;
    let bottom = 0;
    for (let i = 0; i < a.length; i += 3) {
      if (a[i + 1] > 8 && Math.abs(a[i]) < 0.5) top = Math.max(top, Math.abs(a[i + 2]));
      if (a[i + 1] < -8 && Math.abs(a[i]) < 0.5) bottom = Math.max(bottom, Math.abs(a[i + 2]));
    }
    expect(top).toBeGreaterThan(bottom + 0.4);
  });
  it('cathedral arches rise above the seat', () => {
    const res = build('cathedral');
    expect(stats(res.parts).box.max.y).toBeGreaterThan(res.seatY + 1.2);
  });
  it('split has a gap in the middle at the top', () => {
    const res = build('split');
    const a = res.parts[0].geometry.getAttribute('position').array as ArrayLike<number>;
    let centre = 0;
    for (let i = 0; i < a.length; i += 3)
      if (a[i + 1] > 9 && Math.abs(a[i]) < 0.3 && Math.abs(a[i + 2]) < 0.3) centre++;
    expect(centre).toBe(0);
    expect(res.topWidth).toBeGreaterThan(3);
  });
  it('bypass ends sit on opposite sides of the finger axis at the top', () => {
    const res = build('bypass');
    const a = res.parts[0].geometry.getAttribute('position').array as ArrayLike<number>;
    let pos = 0;
    let neg = 0;
    for (let i = 0; i < a.length; i += 3)
      if (a[i + 1] > 9 && Math.abs(a[i]) < 0.5) {
        if (a[i + 2] > 0.4) pos++;
        else if (a[i + 2] < -0.4) neg++;
      }
    expect(pos).toBeGreaterThan(0);
    expect(neg).toBeGreaterThan(0);
  });
  for (const id of ['pave', 'channel']) {
    it(`${id} carries accent stones on the shoulders, more with more coverage`, () => {
      const few = build(id, { coverage: 0.3 }).parts.find((p) => p.slot === 'accent-stone');
      const many = build(id, { coverage: 0.9 }).parts.find((p) => p.slot === 'accent-stone');
      expect(few).toBeTruthy();
      expect(many).toBeTruthy();
      if (!few || !many) return;
      expect(many.geometry.getAttribute('position').count).toBeGreaterThan(
        few.geometry.getAttribute('position').count,
      );
      // stones keep clear of the head
      const a = many.geometry.getAttribute('position').array as ArrayLike<number>;
      for (let i = 0; i < a.length; i += 3) if (a[i + 1] > 0) expect(Math.abs(a[i])).toBeGreaterThan(2.5);
    });
    it(`${id} works with an elongated accent cut`, () => {
      const res = build(id, {}, { accentCut: 'baguette', accentAspect: 2.5, accentSize: 2.4 });
      expect(res.parts.some((p) => p.slot === 'accent-stone')).toBe(true);
    });
  }
  it('channel widens to hold large accent stones', () => {
    expect(build('channel', {}, { accentSize: 2.6 }).topWidth).toBeGreaterThanOrEqual(2.6 + 0.9 - 1e-6);
  });
  it('twisted and braided strands change with their counts', () => {
    const a = stats(build('twisted', { strands: 2 }).parts).tris;
    const b = stats(build('twisted', { strands: 3 }).parts).tris;
    expect(b).toBeGreaterThan(a);
  });
  it('variation seeds change organic shanks', () => {
    for (const id of ['hammered', 'leaf-vine', 'twig']) {
      const a = build(id, { seed: 1 }).parts[0].geometry.getAttribute('position').array as Float32Array;
      const b = build(id, { seed: 2 }).parts[0].geometry.getAttribute('position').array as Float32Array;
      const n = Math.min(a.length, b.length);
      let diff = 0;
      for (let i = 0; i < n; i++) diff = Math.max(diff, Math.abs(a[i] - b[i]));
      expect(diff, id).toBeGreaterThan(0.01);
    }
  });
  it('comfort fit has a domed inside (edges lift off the finger)', () => {
    const res = build('comfort-fit');
    const a = res.parts[0].geometry.getAttribute('position').array as ArrayLike<number>;
    let edgeMin = Infinity;
    for (let i = 0; i < a.length; i += 3)
      if (Math.abs(a[i + 2]) > 1.0 && a[i + 1] < -8 && Math.abs(a[i]) < 0.5)
        edgeMin = Math.min(edgeMin, Math.hypot(a[i], a[i + 1]));
    expect(edgeMin).toBeGreaterThan(8.5 + 0.1);
  });
  it('pave sets stones proud of a bright-cut trough, held by beads above the metal', () => {
    const res = build('pave');
    const stones = res.parts.filter((p) => p.slot === 'accent-stone');
    const metal = res.parts.filter((p) => p.slot === 'shank-metal');
    // stone tables rise above the polished rim, and the beads rise above the stones' girdles
    expect(stats(stones).maxRadial).toBeGreaterThan(8.5 + 1.8);
    expect(stats(metal).tris).toBeGreaterThan(stats(build('plain-flat').parts).tris * 1.5);
  });
  it('twisted and braided wires are round tubes (more strands, more wires)', () => {
    const two = stats(build('twisted', { strands: 2 }).parts);
    const four = stats(build('twisted', { strands: 4 }).parts);
    expect(four.tris).toBeGreaterThan(two.tris);
    expect(two.box.max.z).toBeCloseTo(2.3 / 2, 1);
  });
  it('milgrain and filigree add bead detail beyond a plain band', () => {
    const plain = stats(build('plain-flat').parts).tris;
    expect(stats(build('milgrain').parts).tris).toBeGreaterThan(plain * 2);
    expect(stats(build('vintage-filigree').parts).tris).toBeGreaterThan(plain * 2);
  });
});

describe('accent stones follow the shank and respond to their controls', () => {
  const perStone = stubStone({ length: 1, width: 1, depth: 0.6 }).geometry.getAttribute('position').count;
  const on: Record<string, Record<string, boolean>> = {
    pave: {},
    channel: {},
    split: { pave: true },
    bypass: { pave: true },
    crossover: { pave: true },
    twisted: { pave: true },
    cathedral: { shoulderStones: true },
  };
  const build = (
    id: string,
    extra: Record<string, number | boolean>,
    o: Parameters<typeof stubCtx>[1] = {},
  ) => {
    const fn = shankBuilders.get(id);
    if (!fn) throw new Error(id);
    return fn(stubCtx({ ...(byId.get(id)?.params ?? {}), ...on[id], ...extra }, o));
  };
  const stoneCount = (parts: Part[]) =>
    parts
      .filter((q) => q.slot === 'accent-stone')
      .reduce((n, q) => n + q.geometry.getAttribute('position').count / perStone, 0);
  const verts = (g: THREE.BufferGeometry) => {
    const a = g.getAttribute('position').array as ArrayLike<number>;
    const out: [number, number, number][] = [];
    for (let i = 0; i < a.length; i += 3) out.push([a[i], a[i + 1], a[i + 2]]);
    return out;
  };

  for (const id of Object.keys(on)) {
    describe(id, () => {
      it('is off by default for the optional-stone shanks and on for pave/channel', () => {
        const defaults = stoneCount(
          build(id, id === 'pave' || id === 'channel' ? {} : { pave: false, shoulderStones: false }).parts,
        );
        if (id === 'pave' || id === 'channel') expect(defaults).toBeGreaterThan(4);
        else expect(defaults).toBe(0);
      });
      it('sets whole stones that sit on the metal and stay fused', () => {
        for (const R of [7.5, 10]) {
          const res = build(id, {}, { R });
          const n = stoneCount(res.parts);
          expect(n, `R=${R} stones`).toBeGreaterThan(5);
          expect(Number.isInteger(Math.round(n * 1000) / 1000) || Math.abs(n - Math.round(n)) < 1e-6).toBe(
            true,
          );
          const cell = 0.5;
          const grid = new Map<string, [number, number, number][]>();
          const key = (x: number, y: number, z: number) =>
            `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
          for (const q of res.parts.filter((p) => p.slot === 'shank-metal'))
            for (const m of verts(q.geometry)) {
              const k = key(m[0], m[1], m[2]);
              const list = grid.get(k);
              if (list) list.push(m);
              else grid.set(k, [m]);
            }
          const stone = res.parts.find((q) => q.slot === 'accent-stone');
          if (!stone) throw new Error('no stones');
          const sv = verts(stone.geometry);
          let worst = 0;
          for (let s = 0; s < sv.length; s += perStone) {
            // the stone's nearest approach to the metal (its girdle is sunk into the surface)
            let best = Infinity;
            for (let k = s; k < s + perStone; k++) {
              const [x, y, z] = sv[k];
              for (let dx = -1; dx <= 1; dx++)
                for (let dy = -1; dy <= 1; dy++)
                  for (let dz = -1; dz <= 1; dz++)
                    for (const m of grid.get(key(x + dx * cell, y + dy * cell, z + dz * cell)) ?? [])
                      best = Math.min(best, Math.hypot(x - m[0], y - m[1], z - m[2]));
            }
            worst = Math.max(worst, best);
          }
          expect(worst, `R=${R}: a stone floats ${worst.toFixed(2)} mm from the metal`).toBeLessThan(0.35);
          expect(
            detachedIslands(res.parts.filter((q) => q.slot === 'shank-metal').map((q) => q.geometry)),
          ).toEqual([]);
        }
      });
      it('bigger stones mean fewer of them', () => {
        const small = stoneCount(build(id, { stoneSizeMm: 1.0 }).parts);
        const big = stoneCount(build(id, { stoneSizeMm: 1.6 }).parts);
        expect(small).toBeGreaterThan(big);
        expect(big).toBeGreaterThan(0);
      });
      it('more spacing means fewer stones', () => {
        const tight = stoneCount(build(id, { stoneGapMm: 0 }).parts);
        const loose = stoneCount(build(id, { stoneGapMm: 0.6 }).parts);
        expect(tight).toBeGreaterThan(loose);
      });
      it('coverage sets how far the stones run', () => {
        const short = stoneCount(build(id, { coverage: 0.2 }).parts);
        const long = stoneCount(build(id, { coverage: id === 'crossover' ? 0.32 : 0.45 }).parts);
        expect(long).toBeGreaterThan(short);
      });
      it('takes the design accent size when no override is set', () => {
        const small = stoneCount(build(id, { stoneSizeMm: 0 }, { accentSize: 1.0 }).parts);
        const big = stoneCount(build(id, { stoneSizeMm: 0 }, { accentSize: 1.6 }).parts);
        expect(small).toBeGreaterThan(big);
      });
    });
  }

  it('twisted pave: stones ride the wires, so they spread across the rope width', () => {
    const res = build('twisted', {});
    const stone = res.parts.find((q) => q.slot === 'accent-stone');
    if (!stone) throw new Error('no stones');
    const zs = verts(stone.geometry).map((v) => v[2]);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(1.2);
  });
  it('cathedral shoulder stones sit above the band, up the arches', () => {
    const res = build('cathedral', {});
    const stone = res.parts.find((q) => q.slot === 'accent-stone');
    if (!stone) throw new Error('no stones');
    const ys = verts(stone.geometry).map((v) => v[1]);
    const top = Math.max(...ys);
    expect(top).toBeGreaterThan(res.seatY + 0.5);
  });
});

describe('beaded shank', () => {
  it('is a chain of round beads that closes evenly and sets the band thickness', () => {
    const fn = shankBuilders.get('beaded');
    if (!fn) throw new Error('beaded');
    const one = fn(stubCtx({ beadMm: 2, rows: 1 }));
    const three = fn(stubCtx({ beadMm: 2, rows: 3 }));
    expect(one.seatY).toBeCloseTo(8.5 + 2 - 0.12, 2);
    expect(three.topWidth).toBeGreaterThan(one.topWidth * 2);
    expect(stats(three.parts).tris).toBeGreaterThan(stats(one.parts).tris * 2);
  });
});
