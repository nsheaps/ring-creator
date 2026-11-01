/** Frame outlines and the heads built on them: polygon / cushion bezels, hexagon halo, deco plaque, flank, blades. */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { headBuilders } from '../builders';
import type { Part } from '../types';
import { heads } from '@/models/data/heads';
import type { Params } from '@/models/types';
import './index';
import { cleanOutline, circlePoints, pointAt, support, type CleanOutline } from './common';
import { cushionFrame, polygonFrame } from './frameOutline';
import { stubCtx } from './testStub';

const NEW_IDS = [
  'bezel-polygon',
  'bezel-cushion',
  'halo-hexagon',
  'deco-plaque',
  'cluster-flank',
  'tension-bypass',
];

function build(
  id: string,
  cut = 'round-brilliant',
  params: Params = {},
  bandAxis?: [number, number],
): Part[] {
  const model = heads.find((h) => h.id === id);
  if (!model) throw new Error(id);
  const fn = headBuilders.get(model.builder);
  if (!fn) throw new Error(model.builder);
  return fn(stubCtx({ cut, params: { ...model.params, ...params }, bandAxis }));
}

function box(parts: Part[], slot: Part['slot']): THREE.Box3 {
  const b = new THREE.Box3();
  for (const p of parts.filter((q) => q.slot === slot)) {
    p.geometry.computeBoundingBox();
    if (p.geometry.boundingBox) b.union(p.geometry.boundingBox);
  }
  return b;
}

const circle = (r: number): CleanOutline => cleanOutline({ points: circlePoints(r, r, 64), corners: [] });
const oval = (a: number, b: number): CleanOutline =>
  cleanOutline({ points: circlePoints(a, b, 64), corners: [] });

/** Corner count of a frame: samples whose radius is a local maximum with a clear margin. */
function cornerCount(o: CleanOutline): number {
  const n = 360;
  const r = Array.from({ length: n }, (_, i) => {
    const p = pointAt(o, (i / n) * o.perimeter);
    return Math.hypot(p.x, p.z);
  });
  let c = 0;
  for (let i = 0; i < n; i++) {
    const w = 12;
    let max = true;
    for (let k = -w; k <= w; k++) if (r[(i + k + n) % n] > r[i] + 1e-9) max = false;
    if (max && r[i] > Math.min(...r) * 1.02) c++;
  }
  return c;
}

describe('frame outlines', () => {
  it('a hexagon frame round a circle has six corners and keeps the gap', () => {
    const f = polygonFrame(circle(3), { sides: 6, gap: 1, corner: 0.4 });
    expect(cornerCount(f)).toBe(6);
    // nearest edge is `gap` outside the girdle
    expect(support(f, 0, 1)).toBeGreaterThan(3 + 1 - 1e-6);
    expect(Math.min(...f.pts.map((p) => Math.hypot(p[0], p[1])))).toBeGreaterThanOrEqual(3 + 1 - 1e-3);
  });
  it('octagon and rotation work', () => {
    expect(cornerCount(polygonFrame(circle(3), { sides: 8, gap: 1, corner: 0.3 }))).toBe(8);
    const a = polygonFrame(circle(3), { sides: 6, gap: 1, corner: 0.2 });
    const b = polygonFrame(circle(3), { sides: 6, gap: 1, corner: 0.2, rotationDeg: 30 });
    expect(support(a, 1, 0)).toBeGreaterThan(support(b, 1, 0) + 0.3); // corner on +X versus flat edge
  });
  it('stretches to an oval stone', () => {
    const f = polygonFrame(oval(4, 2.5), { sides: 6, gap: 0.8, stretch: true });
    expect(support(f, 1, 0) / support(f, 0, 1)).toBeGreaterThan(1.3);
    const plain = polygonFrame(oval(4, 2.5), { sides: 6, gap: 0.8, stretch: false });
    expect(support(f, 1, 0) / support(f, 0, 1)).toBeGreaterThan(support(plain, 1, 0) / support(plain, 0, 1));
  });
  it('contain every outline point plus the gap (polygon and cushion)', () => {
    const o = oval(4, 2.5);
    for (const f of [polygonFrame(o, { sides: 6, gap: 0.8, stretch: true }), cushionFrame(o, 0.8)]) {
      const inside = (x: number, z: number) => {
        let hit = false;
        const n = f.pts.length;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const [xi, zi] = f.pts[i];
          const [xj, zj] = f.pts[j];
          if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
        }
        return hit;
      };
      for (const p of o.pts) expect(inside(p[0] * 1.15, p[1] * 1.15)).toBe(true);
    }
  });
});

describe('new framed and flank heads', () => {
  for (const id of NEW_IDS)
    it(`${id} is registered with a description that names its look`, () => {
      const m = heads.find((h) => h.id === id);
      expect(m, id).toBeTruthy();
      expect(m?.description.length).toBeGreaterThan(200);
    });

  it('the hexagon bezel frame is wider than the stone and follows the number of sides', () => {
    const hex = build('bezel-polygon', 'round-brilliant', { sides: 6, tiers: 1 });
    const oct = build('bezel-polygon', 'round-brilliant', { sides: 8, tiers: 1 });
    const w = (ps: Part[]) => box(ps, 'head-metal');
    // frame reaches beyond the girdle by the frame width, and an octagon is rounder than a hexagon on the diagonal
    expect(w(hex).max.x).toBeGreaterThan(3.2 + 0.8);
    expect(w(oct).max.z - w(oct).min.z).toBeLessThan(w(hex).max.x * 2 + 1);
  });

  it('the cushion bezel is squarer than a round frame', () => {
    const diag = (ps: Part[]) => {
      let m = 0;
      for (const p of ps.filter((q) => q.slot === 'head-metal')) {
        const a = p.geometry.getAttribute('position');
        for (let i = 0; i < a.count; i++) m = Math.max(m, Math.abs(a.getX(i)) + Math.abs(a.getZ(i)));
      }
      return m;
    };
    const cush = diag(build('bezel-cushion', 'round-brilliant', { stretch: false }));
    const round = diag(build('bezel-cushion', 'round-brilliant', { stretch: false, frameShape: 'follow' }));
    // the cushion's corners reach further along the diagonal than a circle of the same width
    expect(cush).toBeGreaterThan(round + 0.3);
  });

  it('hexagon halo ring of melee follows an elongated hexagon round an oval', () => {
    const parts = build('halo-hexagon', 'oval', {}, [0, 1]);
    const melee = box(parts, 'accent-stone');
    expect(melee.max.x - melee.min.x).toBeGreaterThan(melee.max.z - melee.min.z);
    expect(parts.filter((p) => p.slot === 'accent-stone').length).toBe(1);
  });

  it('the plaque has pierced openwork (many ribs) and rim diamonds, which can be switched off', () => {
    const base = build('deco-plaque', 'old-european' as string);
    expect(base.some((p) => p.slot === 'accent-stone')).toBe(true);
    const plain = build('deco-plaque', 'round-brilliant', { rimStones: false });
    expect(plain.some((p) => p.slot === 'accent-stone')).toBe(false);
    const few = build('deco-plaque', 'round-brilliant', { ribCount: 6 })[0].geometry.getAttribute(
      'position',
    ).count;
    const many = build('deco-plaque', 'round-brilliant', { ribCount: 24 })[0].geometry.getAttribute(
      'position',
    ).count;
    expect(many).toBeGreaterThan(few);
  });

  it('cluster-flank makes flankCount stones each side, tilted and level with the shoulders', () => {
    for (const n of [1, 3, 5]) {
      const parts = build('cluster-flank', 'oval', { flankCount: n, arrangement: 'column' }, [0, 1]);
      const acc = parts.filter((p) => p.slot === 'accent-stone');
      const count = acc.reduce((s, p) => s + p.geometry.getAttribute('position').count, 0);
      const one = build('cluster-flank', 'oval', { flankCount: 1, arrangement: 'column' }, [0, 1]).filter(
        (p) => p.slot === 'accent-stone',
      );
      const perStone = one.reduce((s, p) => s + p.geometry.getAttribute('position').count, 0) / 2;
      expect(count / perStone, `stones for flankCount ${n}`).toBeGreaterThan(2 * n * 0.9);
      expect(count / perStone).toBeLessThan(2 * n * 1.1);
    }
  });

  it('cluster-flank fan keeps its stones level with the centre, flush against it, on both sides', () => {
    const parts = build('cluster-flank', 'oval', { flankCount: 3 }, [1, 0]);
    const b = box(parts, 'accent-stone');
    expect(b.max.y).toBeLessThan(0.5);
    expect(b.min.y).toBeGreaterThan(-3.2);
    expect(b.min.x).toBeLessThan(-6);
    expect(b.max.x).toBeGreaterThan(6);
  });

  it('tension-bypass blades sit on opposite sides of the centre line at the stone', () => {
    const parts = build('tension-bypass', 'round-brilliant', { sweepOffset: 1.5 }, [1, 0]);
    const g = parts[0].geometry.getAttribute('position');
    let zPlus = 0;
    let zMinus = 0;
    for (let i = 0; i < g.count; i++) {
      if (g.getY(i) < 0.1 || g.getY(i) > 0.4) continue;
      if (Math.abs(g.getX(i)) < 3 || Math.abs(g.getX(i)) > 3.6) continue;
      if (g.getX(i) > 0) zPlus += g.getZ(i);
      else zMinus += g.getZ(i);
    }
    // the +X blade is swept to one side and the -X blade to the other
    expect(zPlus * zMinus).toBeLessThan(0);
  });
});

describe('polygon frame extras: corner beads and side stones in their own bezels', () => {
  const metalVerts = (parts: Part[]) => {
    const out: THREE.Vector3[] = [];
    for (const p of parts.filter((q) => q.slot === 'head-metal')) {
      const a = p.geometry.getAttribute('position');
      for (let i = 0; i < a.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(a, i));
    }
    return out;
  };
  const sanity = (parts: Part[]) => {
    let tris = 0;
    for (const p of parts) {
      const a = p.geometry.getAttribute('position');
      const arr = a.array as ArrayLike<number>;
      for (let i = 0; i < arr.length; i++) expect(Number.isFinite(arr[i])).toBe(true);
      tris += a.count / 3;
    }
    expect(tris).toBeLessThan(60000);
    const b = new THREE.Box3();
    for (const p of parts) {
      p.geometry.computeBoundingBox();
      if (p.geometry.boundingBox) b.union(p.geometry.boundingBox);
    }
    expect(b.max.y).toBeLessThan(3);
    // side stones may follow the shank down the shoulders, never past the equator of the ring
    expect(b.min.y).toBeGreaterThan(-4.2 - (8.6 + 1.8) * 0.9);
    expect(Math.max(b.max.x, -b.min.x, b.max.z, -b.min.z)).toBeLessThan(16);
  };

  it('are off by default (existing designs unchanged)', () => {
    const a = build('bezel-polygon', 'round-brilliant', { tiers: 1 });
    const b = build('bezel-polygon', 'round-brilliant', { tiers: 1, cornerBeads: false, sideStones: 0 });
    expect(a.length).toBe(1);
    expect(a[0].geometry.getAttribute('position').count).toBe(b[0].geometry.getAttribute('position').count);
  });

  for (const rotation of [0, 30])
    it(`corner beads sit on the rim at each of the six corners (rotation ${rotation})`, () => {
      const params = { sides: 6, tiers: 1, frameGap: 0.5, rotation, cornerBeads: true, beadSize: 0.8 };
      const parts = build('bezel-polygon', 'round-brilliant', params);
      sanity(parts);
      const plain = metalVerts(build('bezel-polygon', 'round-brilliant', { ...params, cornerBeads: false }));
      const rimTop = Math.max(...plain.map((v) => v.y));
      // bead tops stand above the rim, near the girdle, in six clusters at the corner angles
      const high = metalVerts(parts).filter((v) => v.y > rimTop + 0.2);
      expect(high.length).toBeGreaterThan(6);
      const bins = new Set<number>();
      for (const v of high) {
        const r = Math.hypot(v.x, v.z);
        expect(r).toBeGreaterThan(3.2 - 0.3);
        expect(r).toBeLessThan(3.2 + 1.2);
        const a = (Math.atan2(v.z, v.x) * 180) / Math.PI - rotation;
        const k = Math.round(a / 60);
        expect(Math.abs(a - k * 60), 'bead at a corner').toBeLessThan(12);
        bins.add(((k % 6) + 6) % 6);
      }
      expect(bins.size).toBe(6);
    });

  it("sideStoneAspect sets the side stone length:width; 0 keeps the accent cut's shape", () => {
    // along the band (x for the default band axis) is the stone's length, across it (z) its width
    const stoneBox = (p: Params) => {
      const parts = build('bezel-polygon', 'round-brilliant', {
        tiers: 1,
        sideStones: 1,
        sideStoneSize: 3,
        ...p,
      });
      const pos = parts.find((q) => q.slot === 'accent-stone')?.geometry.getAttribute('position');
      if (!pos) throw new Error('no side stones');
      let zMax = 0;
      for (let i = 0; i < pos.count; i++) zMax = Math.max(zMax, Math.abs(pos.getZ(i)));
      return 2 * zMax;
    };
    // the stub accent is round: automatic keeps it 3 mm across, an aspect of 2.5 narrows it to 1.2 mm
    expect(stoneBox({})).toBeCloseTo(3, 1);
    expect(stoneBox({ sideStoneAspect: 2.5 })).toBeCloseTo(1.2, 1);
    expect(stoneBox({ sideStoneAspect: 2.5 })).toBeLessThan(stoneBox({ sideStoneAspect: 1.5 }));
  });

  it('side stones sit on both shoulders, each in its own bezel, following the curve', () => {
    const one = build('bezel-polygon', 'round-brilliant', { tiers: 1, sideStones: 1, sideStoneSize: 3 });
    const three = build('bezel-polygon', 'round-brilliant', { tiers: 1, sideStones: 3, sideStoneSize: 3 });
    sanity(three);
    const count = (ps: Part[], slot: Part['slot']) =>
      ps.filter((p) => p.slot === slot).reduce((s, p) => s + p.geometry.getAttribute('position').count, 0);
    // three times the stones and three times the side bezels of a single pair
    expect(count(three, 'accent-stone')).toBe(3 * count(one, 'accent-stone'));
    const bezels = (ps: Part[]) =>
      ps.find((p) => p.label === 'side stone bezels')?.geometry.getAttribute('position').count ?? 0;
    expect(bezels(three)).toBe(3 * bezels(one));
    const acc = box(three, 'accent-stone');
    // both shoulders, beyond the frame, below the centre girdle and dropping with the shank
    expect(acc.max.x).toBeGreaterThan(8);
    expect(acc.min.x).toBeLessThan(-8);
    expect(acc.max.y).toBeLessThan(0);
    const frame = box(build('bezel-polygon', 'round-brilliant', { tiers: 1 }), 'head-metal');
    const stones = three.find((p) => p.slot === 'accent-stone');
    const pos = stones?.geometry.getAttribute('position');
    let inner = -Infinity;
    let outer = Infinity;
    for (let i = 0; pos && i < pos.count; i++) {
      const x = Math.abs(pos.getX(i));
      expect(x, 'stones start outside the frame').toBeGreaterThan(frame.max.x - 0.05);
      if (x < frame.max.x + 2) inner = Math.max(inner, pos.getY(i));
      if (x > acc.max.x - 1) outer = Math.min(outer, -pos.getY(i));
    }
    expect(inner).toBeGreaterThan(-outer);
  });
});
