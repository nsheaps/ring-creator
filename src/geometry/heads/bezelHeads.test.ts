/** Full bezel with optional claws on its rim (`claws`, `clawSize`). */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { headBuilders } from '../builders';
import type { Part } from '../types';
import { heads } from '@/models/data/heads';
import type { Params } from '@/models/types';
import './index';
import { cleanOutline, pointAt, support } from './common';
import { rimClawSites } from './bezelHeads';
import { stubCtx } from './testStub';
import { surfaceArea } from '@/export/meshMath';

const model = heads.find((h) => h.id === 'bezel-full');

function build(cut = 'oval', params: Params = {}, withDefaults = true): Part[] {
  if (!model) throw new Error('bezel-full');
  const fn = headBuilders.get(model.builder);
  if (!fn) throw new Error(model.builder);
  return fn(stubCtx({ cut, params: withDefaults ? { ...model.params, ...params } : params }));
}

function positions(parts: Part[]): Float32Array[] {
  return parts.map((p) => p.geometry.getAttribute('position').array as Float32Array);
}

function triangles(parts: Part[]): number {
  return parts.reduce((s, p) => s + p.geometry.getAttribute('position').count / 3, 0);
}

function area(parts: Part[]): number {
  return positions(parts).reduce((s, a) => s + surfaceArea(a), 0);
}

function box(parts: Part[]): THREE.Box3 {
  const b = new THREE.Box3();
  for (const p of parts) {
    p.geometry.computeBoundingBox();
    if (p.geometry.boundingBox) b.union(p.geometry.boundingBox);
  }
  return b;
}

describe('bezel-full claws', () => {
  it('defaults to no claws', () => {
    expect(model?.params.claws).toBe(0);
    for (const c of model?.controls ?? []) expect(model?.params).toHaveProperty(c.key);
  });

  it('claws = 0 builds exactly the plain bezel, whatever the claw size', () => {
    for (const cut of ['oval', 'round-brilliant', 'emerald-cut']) {
      const plain = positions(build(cut, { bezelThickness: 0.45, bezelHeight: 0.2, baseScale: 0 }, false));
      const off = positions(build(cut, { claws: 0, clawSize: 1.1 }));
      expect(off.length).toBe(plain.length);
      off.forEach((a, i) => expect(Array.from(a)).toEqual(Array.from(plain[i])));
    }
  });

  it('claws add metal, stay finite, bounded and inside the triangle budget', () => {
    for (const cut of ['oval', 'round-brilliant', 'pear', 'marquise', 'emerald-cut']) {
      const plain = build(cut);
      for (const claws of [1, 2, 4, 6]) {
        for (const clawSize of [0.3, 0.6, 1.2]) {
          const parts = build(cut, { claws, clawSize });
          for (const a of positions(parts)) for (const v of a) expect(Number.isFinite(v)).toBe(true);
          expect(area(parts)).toBeGreaterThan(area(plain));
          expect(triangles(parts)).toBeGreaterThan(triangles(plain));
          expect(triangles(parts)).toBeLessThan(60000);
          const ctx = stubCtx({ cut });
          const b = box(parts);
          const pb = box(plain);
          // the claws rise above the rim, but only by about their own size (low profile)
          expect(b.max.y).toBeGreaterThan(pb.max.y);
          expect(b.max.y).toBeLessThan(pb.max.y + clawSize);
          if (clawSize <= 0.6) expect(b.max.y).toBeLessThan(ctx.center.built.crownHeight);
          // and do not reach far outside the rim
          expect(b.max.x).toBeLessThan(pb.max.x + 0.7);
          expect(b.max.z).toBeLessThan(pb.max.z + 0.7);
        }
      }
    }
  });

  it('is deterministic', () => {
    const a = positions(build('oval', { claws: 4, clawSize: 0.7 }));
    const b = positions(build('oval', { claws: 4, clawSize: 0.7 }));
    a.forEach((x, i) => expect(Array.from(x)).toEqual(Array.from(b[i])));
  });

  it('four claws on an oval sit two per long side, mirrored, none on a tip', () => {
    const o = cleanOutline(stubCtx({ cut: 'oval' }).center.built.outline);
    const half = support(o, 1, 0);
    const pts = rimClawSites(o, 4).map((s) => pointAt(o, s));
    expect(pts.filter((p) => p.z > 0)).toHaveLength(2);
    expect(pts.filter((p) => p.z < 0)).toHaveLength(2);
    for (const p of pts) {
      expect(Math.abs(p.x)).toBeLessThan(half * 0.85);
      expect(Math.abs(p.x)).toBeGreaterThan(half * 0.2);
      // each has a mirror image across both axes
      expect(pts.some((q) => Math.abs(q.x + p.x) < 0.05 && Math.abs(q.z - p.z) < 0.05)).toBe(true);
      expect(pts.some((q) => Math.abs(q.x - p.x) < 0.05 && Math.abs(q.z + p.z) < 0.05)).toBe(true);
    }
  });
});
