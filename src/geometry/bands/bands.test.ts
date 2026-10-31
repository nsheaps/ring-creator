import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { bandBuilders } from '../builders';
import type { BandCtx, ContourSpec, Part } from '../types';
import { bands } from '@/models/data/bands';
import { cuts } from '@/models/data/cuts';
import { gems } from '@/models/data/gems';
import { buildStoneByCut } from '../stones';
import './index';
import { BAND_BUILDER_KEYS } from './index';
import { fitStones } from '../helpers';
import { signedVolume } from './common';

const TRI_BUDGET = 60000;
const VOCAB = [
  'plain-comfort',
  'plain-flat',
  'knife-edge',
  'milgrain-band',
  'half-eternity',
  'full-eternity',
  'three-quarter-eternity',
  'channel-band',
  'pave-band',
  'shared-prong',
  'bezel-band',
  'contour-curved',
  'chevron',
  'notched',
  'stacker-trio',
  'twisted-band',
  'braided-band',
  'vine-band',
  'art-deco-band',
  'mixed-metal-band',
  'mens-classic',
  'mens-hammered',
  'mens-inlay',
];
const R = 8.95; // US 6.75
const cutById = new Map(cuts.map((c) => [c.id, c]));
const diamond = gems.find((g) => g.id === 'diamond') ?? gems[0];

function ctxFor(
  params: BandCtx['params'],
  o: {
    contour?: ContourSpec;
    width?: number;
    thickness?: number;
    accentCut?: string;
    accentSize?: number;
  } = {},
): BandCtx {
  const cut = cutById.get(o.accentCut ?? 'round-brilliant');
  if (!cut) throw new Error('missing cut');
  return {
    innerRadius: R,
    params,
    widthMm: o.width ?? 2.8,
    thicknessMm: o.thickness ?? 1.8,
    accent: { gem: diamond, colorHex: '#ffffff', cut, sizeMm: o.accentSize ?? 1.8 },
    contour: o.contour,
    stone(id, dims, opts) {
      const c = cutById.get(id);
      if (!c) throw new Error(`unknown cut ${id}`);
      return buildStoneByCut(c, dims, opts);
    },
  };
}

interface Stats {
  box: THREE.Box3;
  tris: number;
  minR: number;
  maxR: number;
  slots: Set<string>;
}

function stats(parts: Part[]): Stats {
  const box = new THREE.Box3();
  let tris = 0;
  let minR = Infinity;
  let maxR = 0;
  const slots = new Set<string>();
  expect(parts.length).toBeGreaterThan(0);
  for (const p of parts) {
    slots.add(p.slot);
    const pos = p.geometry.getAttribute('position');
    expect(pos, `${p.label} has positions`).toBeTruthy();
    expect(pos.count, `${p.label} non-empty`).toBeGreaterThan(0);
    expect(p.geometry.getIndex(), `${p.label} non-indexed`).toBeNull();
    const arr = pos.array as ArrayLike<number>;
    for (let i = 0; i < arr.length; i += 3) {
      const x = arr[i];
      const y = arr[i + 1];
      const z = arr[i + 2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z))
        throw new Error(`${p.label}: non-finite position`);
      const r = Math.hypot(x, y);
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
    }
    const n = p.geometry.getAttribute('normal');
    expect(n, `${p.label} has normals`).toBeTruthy();
    const na = n.array as ArrayLike<number>;
    for (let i = 0; i < na.length; i++)
      if (!Number.isFinite(na[i])) throw new Error(`${p.label}: NaN normal`);
    expect(signedVolume(p.geometry), `${p.label} winds outward`).toBeGreaterThan(0);
    tris += pos.count / 3;
    p.geometry.computeBoundingBox();
    if (p.geometry.boundingBox) box.union(p.geometry.boundingBox);
  }
  return { box, tris, minR, maxR, slots };
}

const byId = new Map(bands.map((b) => [b.id, b]));
const has = (p: object, k: string) => Object.prototype.hasOwnProperty.call(p, k);

describe('band models', () => {
  it('cover every band style id in the vocabulary', () => {
    expect(bands.map((b) => b.id).sort()).toEqual([...VOCAB].sort());
    expect([...BAND_BUILDER_KEYS].sort()).toEqual([...VOCAB].sort());
  });
  for (const b of bands) {
    it(`${b.id}: data is complete`, () => {
      expect(b.kind).toBe('band');
      expect(bandBuilders.has(b.builder)).toBe(true);
      expect(b.summary.length).toBeGreaterThan(10);
      const words = b.description.split(/\s+/).filter(Boolean).length;
      expect(words).toBeGreaterThan(30);
      expect(words).toBeLessThan(110);
      expect(b.pros?.length).toBeGreaterThan(0);
      expect(b.cons?.length).toBeGreaterThan(0);
      expect(b.bestFor?.length).toBeGreaterThan(0);
      expect(b.tags.length).toBeGreaterThan(0);
      for (const key of Object.keys(b.params))
        expect(
          b.controls.some((c) => c.key === key),
          `${b.id} control for ${key}`,
        ).toBe(true);
      for (const c of b.controls) {
        expect(has(b.params, c.key), `${b.id} default for ${c.key}`).toBe(true);
        if (c.type === 'number') {
          const v = b.params[c.key] as number;
          expect(v).toBeGreaterThanOrEqual(c.min);
          expect(v).toBeLessThanOrEqual(c.max);
        }
        if (c.type === 'select') expect(c.options.some((o) => o.value === b.params[c.key])).toBe(true);
      }
      for (const r of b.related ?? []) expect(r).not.toBe(b.id);
    });
  }
});

/** Max |z| a style may legitimately reach beyond half its width when no contour is given. */
function ownRetreat(id: string, params: BandCtx['params']): number {
  if (id === 'contour-curved') return Number(params.curveRetreat ?? 2);
  if (id === 'chevron') return Number(params.vDepth ?? 2);
  return 0;
}

const CONTOUR: ContourSpec = { retreatMm: 2.5, halfAngle: 0.7, direction: 1 };

describe('band builders', () => {
  for (const id of VOCAB) {
    describe(id, () => {
      const model = byId.get(id);
      const params = model?.params ?? {};
      const fn = bandBuilders.get(model?.builder ?? id);
      const cases: { name: string; ctx: BandCtx }[] = [
        { name: 'default', ctx: ctxFor(params) },
        { name: 'with contour', ctx: ctxFor(params, { contour: CONTOUR }) },
        { name: 'narrow 2 mm, thin', ctx: ctxFor(params, { width: 2, thickness: 1.5, accentSize: 1.3 }) },
        {
          name: 'wide 4 mm, princess accents',
          ctx: ctxFor(params, { width: 4, thickness: 2.2, accentCut: 'princess', accentSize: 2.5 }),
        },
      ];
      for (const c of cases) {
        it(c.name, () => {
          expect(fn, 'builder registered').toBeTruthy();
          if (!fn) return;
          const parts = fn(c.ctx);
          const s = stats(parts);
          const W = Math.max(c.ctx.widthMm, Number(params.minWidthMm ?? 0));
          const T = Math.max(c.ctx.thicknessMm, Number(params.minThicknessMm ?? 0));
          const retreat = c.ctx.contour ? c.ctx.contour.retreatMm : ownRetreat(id, params);
          expect(s.tris).toBeLessThanOrEqual(TRI_BUDGET);
          // inner radius: the band sits on the finger (comfort fit touches at its centre line)
          expect(s.minR).toBeGreaterThan(R - 0.03);
          expect(s.minR).toBeLessThan(R + 0.3);
          // nothing towers more than a few mm above the band
          expect(s.maxR).toBeGreaterThan(R + T * 0.6);
          expect(s.maxR).toBeLessThan(R + T + 2.2);
          const maxZ = Math.max(Math.abs(s.box.min.z), Math.abs(s.box.max.z));
          expect(maxZ).toBeLessThanOrEqual(W / 2 + retreat + 0.1);
          // the band goes all the way round
          expect(s.box.min.y).toBeLessThan(-R);
          expect(s.box.max.y).toBeGreaterThan(R);
          expect(s.slots.has('band-metal')).toBe(true);
          for (const slot of s.slots) expect(['band-metal', 'band-metal2', 'band-stone']).toContain(slot);
          if (model?.hasStones && id !== 'vine-band')
            expect(s.slots.has('band-stone'), 'stones present').toBe(true);
          if (!model?.hasStones) expect(s.slots.has('band-stone')).toBe(false);
        });
      }
    });
  }
});

describe('band invariants', () => {
  const build = (id: string, over: BandCtx['params'] = {}, o: Parameters<typeof ctxFor>[1] = {}) => {
    const m = byId.get(id);
    const fn = bandBuilders.get(id);
    if (!m || !fn) throw new Error(id);
    return fn(ctxFor({ ...m.params, ...over }, o));
  };
  const slot = (parts: Part[], s: string) => parts.filter((p) => p.slot === s);
  const box = (parts: Part[]) => stats(parts).box;

  it('half eternity keeps its stones on the top half; full eternity goes all round', () => {
    const half = box(slot(build('half-eternity'), 'band-stone'));
    expect(half.min.y).toBeGreaterThan(-2);
    const full = box(slot(build('full-eternity'), 'band-stone'));
    expect(full.min.y).toBeLessThan(-R);
    const tq = box(slot(build('three-quarter-eternity'), 'band-stone'));
    expect(tq.min.y).toBeLessThan(-R * 0.5);
    expect(tq.min.y).toBeGreaterThan(-R - 3);
  });

  it('eternity setting switch changes the geometry (channel / bezel)', () => {
    const a = stats(build('half-eternity'));
    const b = stats(build('half-eternity', { setting: 'channel' }));
    const c = stats(build('half-eternity', { setting: 'bezel' }));
    expect(a.tris).not.toBe(b.tris);
    expect(b.tris).not.toBe(c.tris);
  });

  it('more pave rows means more stones', () => {
    const one = stats(slot(build('pave-band', { rows: 1 }, { width: 4 }), 'band-stone')).tris;
    const three = stats(slot(build('pave-band', { rows: 3 }, { width: 4 }), 'band-stone')).tris;
    expect(three).toBeGreaterThan(one * 1.5);
  });

  it('two-tone styles use the second metal slot', () => {
    for (const [id, over] of [
      ['mixed-metal-band', {}],
      ['mens-inlay', {}],
      ['stacker-trio', { twoTone: true }],
      ['twisted-band', { twoTone: true }],
      ['braided-band', { twoTone: true }],
    ] as const) {
      expect(
        build(id, over).some((p) => p.slot === 'band-metal2'),
        id,
      ).toBe(true);
    }
    expect(build('stacker-trio').some((p) => p.slot === 'band-metal2')).toBe(false);
  });

  it('contour moves the top of the band by the retreat and leaves the bottom alone', () => {
    const parts = build('plain-comfort', {}, { contour: CONTOUR });
    const geo = parts[0].geometry.getAttribute('position');
    let topZ = -Infinity;
    let bottomZ = -Infinity;
    for (let i = 0; i < geo.count; i++) {
      const y = geo.getY(i);
      const z = geo.getZ(i);
      if (y > R) topZ = Math.max(topZ, z);
      if (y < -R) bottomZ = Math.max(bottomZ, z);
    }
    expect(topZ).toBeGreaterThan(2.8 / 2 + CONTOUR.retreatMm - 0.3);
    expect(bottomZ).toBeLessThan(2.8 / 2 + 0.05);
  });

  it('contour-curved and chevron bend even without a contour; chevron follows the contour direction', () => {
    expect(box(build('contour-curved')).max.z).toBeGreaterThan(2.8 / 2 + 1.5);
    expect(box(build('chevron')).max.z).toBeGreaterThan(2.8 / 2 + 1.5);
    expect(box(build('chevron', {}, { contour: { ...CONTOUR, direction: -1 } })).min.z).toBeLessThan(
      -(2.8 / 2 + 1.5),
    );
  });

  it('notched band is narrower at the top than at the bottom', () => {
    const g = build('notched')[0].geometry.getAttribute('position');
    let topMin = Infinity;
    let botMin = Infinity;
    for (let i = 0; i < g.count; i++) {
      if (g.getY(i) > R && Math.abs(g.getX(i)) < 0.5) topMin = Math.min(topMin, g.getZ(i));
      if (g.getY(i) < -R) botMin = Math.min(botMin, g.getZ(i));
    }
    expect(topMin).toBeGreaterThan(botMin + 0.8);
  });

  it("men's styles default to a men's width and can be narrowed", () => {
    expect(box(build('mens-classic')).max.z).toBeGreaterThan(2.9);
    expect(box(build('mens-classic', { minWidthMm: 0 })).max.z).toBeLessThan(1.5);
  });

  it('hammered pattern is deterministic and seed-dependent', () => {
    const a = build('mens-hammered')[0].geometry.getAttribute('position').array as Float32Array;
    const b = build('mens-hammered')[0].geometry.getAttribute('position').array as Float32Array;
    const c = build('mens-hammered', { seed: 7 })[0].geometry.getAttribute('position').array as Float32Array;
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });

  it('stones never poke through the inside of the band', () => {
    for (const id of [
      'half-eternity',
      'full-eternity',
      'channel-band',
      'pave-band',
      'bezel-band',
      'art-deco-band',
      'vine-band',
    ]) {
      const stones = slot(build(id, {}, { thickness: 1.4, accentSize: 2.6 }), 'band-stone');
      if (stones.length) expect(stats(stones).minR, id).toBeGreaterThan(R + 0.05);
    }
  });

  it('full eternity stones close the circle with even gaps; partial rows keep the exact pitch', () => {
    const full = fitStones(0, Math.PI * 2, 10, 1.5, 0.12);
    expect(full.size).toBeLessThanOrEqual(1.5);
    expect(full.size).toBeGreaterThan(1.3);
    expect(full.count * full.pitch).toBeCloseTo(Math.PI * 2 * 10, 6);
    const part = fitStones(0, Math.PI, 10, 1.5, 0.12);
    expect(part.size).toBe(1.5);
    expect((part.angles[1] - part.angles[0]) * 10).toBeCloseTo(1.62, 6);
    expect(part.angles[0] + part.angles[part.count - 1]).toBeCloseTo(Math.PI, 6);
  });

  it('shared-prong band has scalloped sides that the eternity styles do not', () => {
    const a = stats(slot(build('shared-prong'), 'band-metal'));
    const b = stats(slot(build('shared-prong', { scallop: false }), 'band-metal'));
    expect(a.tris).not.toBe(b.tris);
  });

  it('rope and braid strands are round wires that sit on the finger', () => {
    for (const id of ['twisted-band', 'braided-band']) {
      const s = stats(build(id));
      expect(s.minR, id).toBeCloseTo(R, 2);
    }
  });

  it('vine buds can be switched off', () => {
    expect(build('vine-band', { buds: false }).some((p) => p.slot === 'band-stone')).toBe(false);
    expect(build('art-deco-band', { stones: false }).some((p) => p.slot === 'band-stone')).toBe(false);
  });
});

describe('band triangle report', () => {
  it('prints triangle counts (informational)', () => {
    const rows: string[] = [];
    for (const b of bands) {
      const fn = bandBuilders.get(b.builder);
      if (!fn) continue;
      rows.push(`${b.id}: ${stats(fn(ctxFor(b.params))).tris}`);
    }
    expect(rows.length).toBe(VOCAB.length);
    if (process.env.BAND_REPORT) console.log(rows.join('\n'));
  });
});
