/** Swept tension blades (tension-bypass): sanity, low ribbon profile, and every control visibly changes the shape. */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { headBuilders } from '../builders';
import type { Part } from '../types';
import { heads } from '@/models/data/heads';
import type { Params } from '@/models/types';
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
});
