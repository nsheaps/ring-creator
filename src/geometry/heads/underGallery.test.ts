import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { headBuilders } from '../builders';
import type { Part } from '../types';
import { heads } from '@/models/data/heads';
import './index';
import { cleanOutline, stoneSurfaceY, support } from './common';
import { stubCtx } from './testStub';

const PRONG_HEADS = heads.filter((h) => h.controls.some((c) => c.key === 'underGallery'));

function tris(parts: Part[]): number {
  return parts.reduce((n, p) => n + p.geometry.getAttribute('position').count / 3, 0);
}

function build(id: string, params: Record<string, unknown>, cut = 'emerald-cut') {
  const model = heads.find((h) => h.id === id);
  if (!model) throw new Error(id);
  const fn = headBuilders.get(model.builder);
  if (!fn) throw new Error(model.builder);
  const ctx = stubCtx({ cut, params: { ...model.params, ...params } as never, accentSize: 1.2 });
  return { parts: fn(ctx), ctx };
}

describe('under-gallery', () => {
  it('is offered (off by default) on the prong heads', () => {
    expect(PRONG_HEADS.map((h) => h.id)).toContain('solitaire-4-prong');
    for (const h of PRONG_HEADS) expect(h.params.underGallery).toBe(false);
  });

  for (const h of PRONG_HEADS) {
    it(`${h.id}: off adds no stones; on adds a deterministic, bounded row of stones`, () => {
      const off = build(h.id, {});
      expect(off.parts.some((p) => p.label === 'under-gallery stones')).toBe(false);
      const on = build(h.id, { underGallery: true });
      const again = build(h.id, { underGallery: true });
      const stones = on.parts.find((p) => p.label === 'under-gallery stones');
      expect(stones, 'stones part').toBeTruthy();
      if (!stones) return;
      const pos = stones.geometry.getAttribute('position');
      expect(pos.count).toBeGreaterThan(0);
      for (let i = 0; i < pos.array.length; i++) expect(Number.isFinite(pos.array[i])).toBe(true);
      expect(Array.from(pos.array)).toEqual(
        Array.from(
          again.parts.find((p) => p.label === 'under-gallery stones')?.geometry.getAttribute('position')
            .array ?? [],
        ),
      );
      expect(tris(on.parts)).toBeLessThan(60000);
      // all stones sit below the girdle and within a few mm of the outline
      stones.geometry.computeBoundingBox();
      const box = stones.geometry.boundingBox ?? new THREE.Box3();
      const o = cleanOutline(on.ctx.center.built.outline);
      expect(box.max.y).toBeLessThan(0.05);
      expect(box.min.y).toBeGreaterThan(-on.ctx.baseDrop - 0.5);
      expect(box.max.x).toBeLessThan(support(o, 1, 0) + 2);
      expect(box.max.z).toBeLessThan(support(o, 0, 1) + 2);
    });
  }

  it('sets a full row (several stones per side) on an emerald cut, clear of the centre pavilion', () => {
    const { parts, ctx } = build('solitaire-4-prong', { underGallery: true });
    const stones = parts.find((p) => p.label === 'under-gallery stones');
    if (!stones) throw new Error('no stones');
    const pos = stones.geometry.getAttribute('position');
    // count stones by distinct instances: each stub stone has the same vertex count
    const single = ctx.stone('round-brilliant', { length: 1, width: 1, depth: 0.6 });
    const per = single.geometry.toNonIndexed().getAttribute('position').count;
    expect(pos.count / per).toBeGreaterThanOrEqual(10);
    // no stone vertex inside the centre stone
    const cb = ctx.center.built;
    let inside = 0;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 0) continue;
      const sy = stoneSurfaceY(cb, pos.getX(i), pos.getZ(i), 'bottom');
      if (sy !== null && sy < y - 0.02) inside++;
    }
    expect(inside).toBe(0);
  });

  it('cups are off by default and leave the default build unchanged', () => {
    for (const h of PRONG_HEADS) expect(h.params.underGalleryCups).toBe(false);
    const plain = build('solitaire-4-prong', { underGallery: true });
    const off = build('solitaire-4-prong', { underGallery: true, underGalleryCups: false });
    expect(tris(off.parts)).toBe(tris(plain.parts));
    // cups without the under-gallery do nothing
    expect(tris(build('solitaire-4-prong', { underGalleryCups: true }).parts)).toBe(
      tris(build('solitaire-4-prong', {}).parts),
    );
  });

  for (const h of PRONG_HEADS) {
    it(`${h.id}: U cups are finite, deterministic, bounded and within budget`, () => {
      const on = build(h.id, { underGallery: true, underGalleryCups: true });
      const again = build(h.id, { underGallery: true, underGalleryCups: true });
      const metal = on.parts.find((p) => p.slot === 'head-metal');
      if (!metal) throw new Error('no metal');
      const pos = metal.geometry.getAttribute('position');
      for (let i = 0; i < pos.array.length; i++) expect(Number.isFinite(pos.array[i])).toBe(true);
      expect(tris(on.parts)).toBe(tris(again.parts));
      expect(tris(on.parts)).toBeLessThan(60000);
      metal.geometry.computeBoundingBox();
      const box = metal.geometry.boundingBox ?? new THREE.Box3();
      const o = cleanOutline(on.ctx.center.built.outline);
      expect(box.max.x).toBeLessThan(support(o, 1, 0) + 2);
      expect(box.max.z).toBeLessThan(support(o, 0, 1) + 2);
    });
  }

  it('cups add metal under every stone and keep the stones clear of the centre pavilion', () => {
    const beads = build('solitaire-4-prong', { underGallery: true });
    const { parts, ctx } = build('solitaire-4-prong', { underGallery: true, underGalleryCups: true });
    const metalTris = (ps: Part[]) =>
      ps
        .filter((p) => p.slot === 'head-metal')
        .reduce((n, p) => n + p.geometry.getAttribute('position').count / 3, 0);
    expect(metalTris(parts)).toBeGreaterThan(metalTris(beads.parts) + 1000);
    const stones = parts.find((p) => p.label === 'under-gallery stones');
    if (!stones) throw new Error('no stones');
    const pos = stones.geometry.getAttribute('position');
    const single = ctx.stone('round-brilliant', { length: 1, width: 1, depth: 0.6 });
    const per = single.geometry.toNonIndexed().getAttribute('position').count;
    expect(pos.count / per).toBeGreaterThanOrEqual(8);
    const cb = ctx.center.built;
    let inside = 0;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 0) continue;
      const sy = stoneSurfaceY(cb, pos.getX(i), pos.getZ(i), 'bottom');
      if (sy !== null && sy < y - 0.02) inside++;
    }
    expect(inside).toBe(0);
  });

  it('underGalleryCount fills the long side with more, smaller stones, still clear of the pavilion; 0 = auto', () => {
    for (const h of PRONG_HEADS) expect(h.params.underGalleryCount).toBe(0);
    const auto = build('solitaire-4-prong', { underGallery: true, underGalleryCups: true });
    const zero = build('solitaire-4-prong', {
      underGallery: true,
      underGalleryCups: true,
      underGalleryCount: 0,
    });
    expect(tris(zero.parts)).toBe(tris(auto.parts));
    const count = (ps: Part[], c: typeof auto.ctx) => {
      const stones = ps.find((p) => p.label === 'under-gallery stones');
      if (!stones) throw new Error('no stones');
      const single = c.stone('round-brilliant', { length: 1, width: 1, depth: 0.6 });
      return {
        n:
          stones.geometry.getAttribute('position').count /
          single.geometry.toNonIndexed().getAttribute('position').count,
        stones,
      };
    };
    const { parts, ctx } = build('solitaire-4-prong', {
      underGallery: true,
      underGalleryCups: true,
      underGalleryCount: 6,
    });
    const before = count(auto.parts, auto.ctx).n;
    const { n, stones } = count(parts, ctx);
    expect(n).toBeGreaterThan(before);
    expect(n).toBeGreaterThanOrEqual(12);
    const pos = stones.geometry.getAttribute('position');
    const cb = ctx.center.built;
    let inside = 0;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 0) continue;
      const sy = stoneSurfaceY(cb, pos.getX(i), pos.getZ(i), 'bottom');
      if (sy !== null && sy < y - 0.02) inside++;
    }
    expect(inside).toBe(0);
  });
});
