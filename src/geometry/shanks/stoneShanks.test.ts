import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import '@/models/data';
import '@/geometry';
import { engagementParts } from '@/geometry/assemble';
import { exampleDesigns } from '@/models/data/examples';
import type { Design } from '@/models/types';
import type { Part } from '../types';
import { MICRO_PAVE_MIN_T } from './stoneShanks';

const TRI_BUDGET = 60000;

function microPaveDesign(params: Record<string, number>): Design {
  const base = exampleDesigns.find((d) => d.id === 'r5-026');
  if (!base?.engagement) throw new Error('r5-026 missing');
  const d = JSON.parse(JSON.stringify(base)) as Design;
  if (!d.engagement) throw new Error('no engagement');
  d.engagement.shank.params = { ...d.engagement.shank.params, ...params };
  return d;
}

function measure(parts: Part[], slot: Part['slot']) {
  let maxR = 0;
  let minR = Infinity;
  let maxZ = 0;
  let tris = 0;
  for (const p of parts.filter((q) => q.slot === slot)) {
    const a = p.geometry.getAttribute('position').array as ArrayLike<number>;
    for (let i = 0; i < a.length; i += 3) {
      const [x, y, z] = [a[i], a[i + 1], a[i + 2]];
      expect(Number.isFinite(x + y + z)).toBe(true);
      const r = Math.hypot(x, y);
      maxR = Math.max(maxR, r);
      minR = Math.min(minR, r);
      maxZ = Math.max(maxZ, Math.abs(z));
    }
    tris += a.length / 9;
  }
  return { maxR, minR, maxZ, tris };
}

describe('micro-pave shank (r5-026)', () => {
  const parts = engagementParts(microPaveDesign({})).parts;
  const shankParts = parts.filter((p) => p.slot === 'shank-metal' || p.slot === 'accent-stone');

  it('lays the stones table-out and flush: no culet pokes out of the metal, crowns barely stand proud', () => {
    // measure only below the head (y < 0), where nothing but the shank is
    const below = shankParts.map((p) => {
      const pos = p.geometry.getAttribute('position');
      const keep: number[] = [];
      for (let i = 0; i < pos.count; i += 3) {
        if (pos.getY(i) < 0 && pos.getY(i + 1) < 0 && pos.getY(i + 2) < 0)
          for (let k = 0; k < 3; k++) keep.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
      return { ...p, geometry: g };
    });
    const m = measure(below, 'shank-metal');
    const s = measure(below, 'accent-stone');
    expect(s.tris).toBeGreaterThan(0);
    // a stone upside down would stick its pavilion (about 0.5 mm) out past the metal
    expect(s.maxR - m.maxR).toBeLessThan(0.2);
    expect(s.maxZ - m.maxZ).toBeLessThan(0.2);
    // and the stones are not buried either: their tables reach the metal surface
    expect(s.maxR).toBeGreaterThan(m.maxR - 0.15);
  });

  it('holds the stones with beads raised from the metal between them', () => {
    const metalParts = parts.filter((p) => p.slot === 'shank-metal');
    const verts = metalParts.reduce((n, p) => n + p.geometry.getAttribute('position').count, 0);
    const stones = measure(parts, 'accent-stone').tris;
    // the swept band alone is a few thousand triangles; beads add a share per stone
    const plain = engagementParts(microPaveDesign({ coverage: 0.1 })).parts.filter(
      (p) => p.slot === 'shank-metal',
    );
    const plainVerts = plain.reduce((n, p) => n + p.geometry.getAttribute('position').count, 0);
    expect(verts).toBeGreaterThan(plainVerts + stones / 4);
  });

  it(`is at least ${MICRO_PAVE_MIN_T} mm thick radially, even when asked for less`, () => {
    const thin = engagementParts(microPaveDesign({ thicknessMm: 1.2, topThicknessMm: 1.2 })).parts;
    const pos = thin
      .filter((p) => p.slot === 'shank-metal')
      .map((p) => p.geometry.getAttribute('position').array as ArrayLike<number>);
    // at the bottom of the ring (x ~ 0, y < 0): outer minus inner radius
    let inner = Infinity;
    let outer = 0;
    for (const a of pos)
      for (let i = 0; i < a.length; i += 3)
        if (Math.abs(a[i]) < 0.3 && a[i + 1] < 0 && Math.abs(a[i + 2]) < 0.3) {
          inner = Math.min(inner, -a[i + 1]);
          outer = Math.max(outer, -a[i + 1]);
        }
    expect(outer - inner).toBeGreaterThan(MICRO_PAVE_MIN_T - 0.05);
  });

  it('stays inside the triangle budget at the densest settings', () => {
    const dense = engagementParts(microPaveDesign({ rows: 8, stoneSizeMm: 0.8, coverage: 1 })).parts;
    const t = measure(dense, 'shank-metal').tris + measure(dense, 'accent-stone').tris;
    expect(t).toBeLessThan(TRI_BUDGET);
  });
});
