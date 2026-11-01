/** Swept tension blades (tension-bypass): sanity, low ribbon profile, and every control visibly changes the shape. */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { headBuilders } from '../builders';
import type { Part } from '../types';
import { heads } from '@/models/data/heads';
import type { Design, Params } from '@/models/types';
import { rings } from '@/models/data/examples/rings';
import { engagementParts } from '../assemble';
import '@/models/data';
import '@/geometry';
import './index';
import { signedVolume } from './common';
import { STUB_CUTS, stubCtx } from './testStub';

function build(params: Params = {}, cut = 'round-brilliant', baseDrop = 3.2): Part[] {
  const model = heads.find((h) => h.id === 'tension-bypass');
  if (!model) throw new Error('tension-bypass model missing');
  const fn = headBuilders.get(model.builder);
  if (!fn) throw new Error(`builder ${model.builder} missing`);
  return fn(stubCtx({ cut, baseDrop, params: { ...model.params, ...params }, bandAxis: [1, 0] }));
}

/** All vertices of the head metal (band axis is +X, across the finger is +Z in these tests). */
function verts(parts: Part[]): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const p of parts.filter((q) => q.slot === 'head-metal')) {
    const a = p.geometry.getAttribute('position');
    for (let i = 0; i < a.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(a, i));
  }
  return out;
}

describe('tension-bypass swept blades', () => {
  for (const cut of STUB_CUTS)
    it(`${cut}: finite, closed, bounded, within the triangle budget`, () => {
      const parts = build({}, cut);
      expect(parts.length).toBe(1);
      const g = parts[0].geometry;
      const pos = g.getAttribute('position');
      expect(pos.count).toBeGreaterThan(300);
      expect(pos.count / 3).toBeLessThan(20000);
      const arr = pos.array as ArrayLike<number>;
      for (let i = 0; i < arr.length; i++) expect(Number.isFinite(arr[i])).toBe(true);
      const n = g.getAttribute('normal').array as ArrayLike<number>;
      for (let i = 0; i < n.length; i++) expect(Number.isFinite(n[i])).toBe(true);
      expect(signedVolume(g), 'winds outward').toBeGreaterThan(0);
      g.computeBoundingBox();
      const b = g.boundingBox ?? new THREE.Box3();
      expect(b.max.x).toBeLessThan(14);
      expect(b.min.x).toBeGreaterThan(-14);
      expect(Math.max(b.max.z, -b.min.z)).toBeLessThan(10);
      expect(b.min.y).toBeGreaterThan(-3.2 - 4.2);
    });

  it('the blades wrap opposite sides of the stone, low beside the girdle', () => {
    const v = verts(build());
    const near = v.filter((p) => Math.abs(p.x) < 1);
    // across the finger, beyond the girdle radius (3.2 mm) on both sides
    expect(near.some((p) => p.z > 3.2)).toBe(true);
    expect(near.some((p) => p.z < -3.2)).toBe(true);
    expect(
      near.some((p) => p.y > 0 && Math.abs(p.z) < 2.8),
      'nothing over the table',
    ).toBe(false);
    // low: the top barely clears the girdle, well under the table
    const top = Math.max(...near.map((p) => p.y));
    expect(top).toBeGreaterThan(0.05);
    expect(top).toBeLessThan(0.7);
    // the +X blade wraps the +Z side and the -X blade the -Z side (point symmetric, like a bypass)
    const shoulders = v.filter((p) => Math.abs(p.x) > 5 && p.y > -4);
    const plus = shoulders.filter((p) => p.x > 0);
    const minus = shoulders.filter((p) => p.x < 0);
    const mz = (ps: THREE.Vector3[]) => ps.reduce((s, p) => s + p.z, 0) / ps.length;
    expect(mz(plus)).toBeGreaterThan(0.3);
    expect(mz(minus)).toBeLessThan(-0.3);
  });

  it('reaches down onto the shank seat', () => {
    const v = verts(build({}, 'round-brilliant', 3.2));
    expect(Math.min(...v.map((p) => p.y))).toBeLessThan(-3.2);
  });

  it('blade width widens the ribbon round the stone', () => {
    const reach = (w: number) =>
      Math.max(
        ...verts(build({ bladeWidth: w }))
          .filter((p) => Math.abs(p.x) < 0.5)
          .map((p) => p.z),
      );
    expect(reach(3.5) - reach(1.6)).toBeGreaterThan(1.2);
  });

  it('blade depth deepens the ribbon at the stone', () => {
    const low = (t: number) =>
      Math.min(
        ...verts(build({ jawThickness: t }))
          .filter((p) => Math.abs(p.x) < 0.5)
          .map((p) => p.y),
      );
    expect(low(1) - low(3)).toBeGreaterThan(1.2);
  });

  it('sweep offset moves where the blades meet the shank', () => {
    const at = (o: number) => {
      const s = verts(build({ sweepOffset: o })).filter((p) => p.x > 5.5 && p.y < -2);
      return s.reduce((a, p) => a + p.z, 0) / s.length;
    };
    expect(at(2.2) - at(0)).toBeGreaterThan(1.2);
  });

  it('wrap carries each blade further round the stone', () => {
    // the +X blade wraps the +Z side; its tip reaches further towards -X with more wrap
    const tip = (w: number) =>
      Math.min(
        ...verts(build({ wrap: w }))
          .filter((p) => p.z > 2.5)
          .map((p) => p.x),
      );
    expect(tip(10) - tip(70)).toBeGreaterThan(2.5);
  });

  it('bank tilts the ribbon face up and away from the stone, keeping the edge on the girdle', () => {
    // across the stone (|x| < 0.5, +Z side): the outer edge drops, the stone-side edge stays put
    const side = (bank: number) =>
      verts(build({ bank, bladeWidth: 3 })).filter((p) => Math.abs(p.x) < 0.5 && p.z > 0);
    const outerTop = (bank: number) =>
      Math.max(
        ...side(bank)
          .filter((p) => p.z > 5)
          .map((p) => p.y),
      );
    const innerTop = (bank: number) =>
      Math.max(
        ...side(bank)
          .filter((p) => p.z < 3.6)
          .map((p) => p.y),
      );
    expect(outerTop(0) - outerTop(30)).toBeGreaterThan(0.5);
    expect(Math.abs(innerTop(30) - innerTop(0))).toBeLessThan(0.35);
  });

  it('each blade tapers to a point beside the stone', () => {
    // the +X blade wraps the +Z side and ends past the middle (90 deg): measure its radial width by angle round the stone
    const v = verts(build({ wrap: 60, bladeWidth: 3 })).filter((p) => p.z > 0 && p.y > -1);
    const ang = (p: THREE.Vector3) => (Math.atan2(p.z, p.x) * 180) / Math.PI;
    const end = Math.max(...v.map(ang));
    const widthAt = (a: number) => {
      const r = v.filter((p) => Math.abs(ang(p) - a) < 2).map((p) => Math.hypot(p.x, p.z));
      return Math.max(...r) - Math.min(...r);
    };
    expect(end).toBeGreaterThan(140);
    expect(widthAt(end - 4)).toBeLessThan(widthAt(90) * 0.4);
  });

  it('hand: left mirrors the swirl (the +X blade wraps the -Z side)', () => {
    const mz = (hand: string) => {
      const s = verts(build({ hand })).filter((p) => p.x > 5 && p.y > -4);
      return s.reduce((a, p) => a + p.z, 0) / s.length;
    };
    expect(mz('right')).toBeGreaterThan(0.3);
    expect(mz('left')).toBeLessThan(-0.3);
    expect(mz('left')).toBeCloseTo(-mz('right'), 5);
  });

  it('blade pave: off by default; on lays stones along both blades, deterministic and in budget', () => {
    expect(build().some((p) => p.slot === 'accent-stone')).toBe(false);
    const parts = build({ bladePave: true });
    const stones = parts.find((p) => p.slot === 'accent-stone');
    expect(stones).toBeTruthy();
    if (!stones) return;
    const pos = stones.geometry.getAttribute('position');
    const arr = pos.array as ArrayLike<number>;
    for (let i = 0; i < arr.length; i++) expect(Number.isFinite(arr[i])).toBe(true);
    const total = parts.reduce((s, p) => s + p.geometry.getAttribute('position').count / 3, 0);
    expect(total).toBeLessThan(40000);
    // stones on both blades (both ends of the band), above the shank seat, clear of the table
    let plus = 0;
    let minus = 0;
    for (let i = 0; i < arr.length; i += 3) {
      if (arr[i] > 2) plus++;
      if (arr[i] < -2) minus++;
      if (arr[i + 1] > 0.6) expect(Math.hypot(arr[i], arr[i + 2])).toBeGreaterThan(3);
    }
    expect(plus).toBeGreaterThan(0);
    expect(minus).toBeGreaterThan(0);
    // same params, same stones
    const again = build({ bladePave: true }).find((p) => p.slot === 'accent-stone');
    expect(Array.from(again?.geometry.getAttribute('position').array ?? [])).toEqual(Array.from(arr));
    // bigger stones: fewer of them
    const count = (size: number) =>
      build({ bladePave: true, paveSizeMm: size })
        .find((p) => p.slot === 'accent-stone')
        ?.geometry.getAttribute('position').count ?? 0;
    expect(count(0.8)).toBeGreaterThan(count(1.5));
  });
});

describe('tension-bypass blades grown from a bypass shank with blade ends', () => {
  const base = rings.find((r) => r.id === 'r5-004');
  if (!base) throw new Error('r5-004 missing');
  const design = (shank: Params, headExtra: Params = {}): Design => ({
    ...base,
    engagement: {
      ...base.engagement,
      head: { ...base.engagement.head, params: { ...base.engagement.head.params, ...headExtra } },
      shank: { ...base.engagement.shank, params: { ...base.engagement.shank.params, ...shank } },
    },
  });
  const pts = (parts: Part[], slot: string): THREE.Vector3[] => {
    const out: THREE.Vector3[] = [];
    for (const p of parts.filter((q) => q.slot === slot)) {
      const a = p.geometry.getAttribute('position');
      for (let i = 0; i < a.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(a, i));
    }
    return out;
  };
  /** (z, radius) extents of the vertices lying in the radial plane `deg` from the top, on the +X or -X side */
  const at = (v: THREE.Vector3[], deg: number, side: 1 | -1) => {
    const a = (deg * Math.PI) / 180;
    const sel = v.filter((p) => side * p.x > 0 && Math.abs(Math.atan2(side * p.x, p.y) - a) < 2e-4);
    const zs = sel.map((p) => p.z);
    const rs = sel.map((p) => Math.hypot(p.x, p.y));
    return {
      n: sel.length,
      z0: Math.min(...zs),
      z1: Math.max(...zs),
      r0: Math.min(...rs),
      r1: Math.max(...rs),
    };
  };

  for (const endDeg of [34, 46])
    for (const hand of ['left', 'right'])
      it(`each blade's first section is the shank end's (endDeg ${endDeg}, ${hand} hand)`, () => {
        const { parts } = engagementParts(design({ ends: 'blade', endDeg, hand }, { hand }));
        const sh = pts(parts, 'shank-metal');
        const hd = pts(parts, 'head-metal');
        for (const side of [1, -1] as const) {
          const s = at(sh, endDeg, side);
          const h = at(hd, endDeg, side);
          expect(s.n).toBeGreaterThan(10);
          expect(h.n).toBeGreaterThan(10);
          expect(Math.abs(h.r0 - s.r0)).toBeLessThan(0.01);
          expect(Math.abs(h.r1 - s.r1)).toBeLessThan(0.01);
          expect(Math.abs(h.z0 - s.z0)).toBeLessThan(0.03);
          expect(Math.abs(h.z1 - s.z1)).toBeLessThan(0.03);
          // the blade only carries on towards the top: no head metal further down the shoulder than the end
          const beyond = hd.filter(
            (p) => side * p.x > 0 && Math.atan2(side * p.x, p.y) > (endDeg * Math.PI) / 180 + 1e-3,
          );
          expect(beyond.length).toBe(0);
        }
      });

  it('an overlapping shank passes over the top; with blade ends the top is left to the blades', () => {
    const plain = engagementParts(design({ ends: 'overlap' }));
    const joined = engagementParts(design({ ends: 'blade', endDeg: 40 }));
    const hd = (e: { parts: Part[] }) => pts(e.parts, 'head-metal');
    // the overlapping shank passes over the top, the joined one leaves it to the blades
    const topShank = (e: { parts: Part[] }) =>
      pts(e.parts, 'shank-metal').some((p) => p.y > 0 && Math.abs(Math.atan2(p.x, p.y)) < 0.05);
    expect(topShank(plain)).toBe(true);
    expect(topShank(joined)).toBe(false);
    expect(hd(plain).length).not.toBe(hd(joined).length);
  });
});
