import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import '@/models/data';
import '@/geometry';
import { buildStone, engagementParts } from '@/geometry/assemble';
import { getModel } from '@/models/registry';
import { exampleDesigns } from '@/models/data/examples';
import type { Design } from '@/models/types';
import type { Part } from '../types';
import { MICRO_PAVE_MIN_T } from './stoneShanks';
import { computeSpec } from '@/export/spec';

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

/** Every micro-pave stone's girdle centre and diameter (the farthest pair of its vertices spans the girdle). */
function paveStones(parts: Part[], label: string): { c: THREE.Vector3; d: number }[] {
  const per = buildStone(
    getModel('cut', 'round-brilliant'),
    { length: 1, width: 1, depth: 0.6 },
    { detail: 'low' },
  ).geometry;
  const v = (per.index ? per.toNonIndexed() : per).getAttribute('position').count;
  const out: { c: THREE.Vector3; d: number }[] = [];
  for (const p of parts.filter((q) => q.label === label)) {
    const pos = p.geometry.getAttribute('position');
    for (let s = 0; s + v <= pos.count; s += v) {
      const pts = Array.from({ length: v }, (_, i) => new THREE.Vector3().fromBufferAttribute(pos, s + i));
      let best = 0;
      let c = pts[0];
      for (let i = 0; i < v; i++)
        for (let j = i + 1; j < v; j++) {
          const dd = pts[i].distanceToSquared(pts[j]);
          if (dd > best) {
            best = dd;
            c = pts[i].clone().add(pts[j]).multiplyScalar(0.5);
          }
        }
      out.push({ c, d: Math.sqrt(best) });
    }
  }
  return out;
}

/** For each stone, the gaps (as a fraction of its diameter) to its k nearest neighbours. */
function neighbourGaps(stones: { c: THREE.Vector3; d: number }[], k: number): number[][] {
  return stones.map((a) =>
    stones
      .filter((b) => b !== a)
      .map((b) => (a.c.distanceTo(b.c) - (a.d + b.d) / 2) / a.d)
      .sort((x, y) => x - y)
      .slice(0, k),
  );
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

  it('packs the stones edge to edge in staggered rows: neighbours nearly touch and never overlap', () => {
    const cases: Record<string, number>[] = [{}, { rows: 3 }, { rows: 8, coverage: 0.5 }];
    for (const over of cases) {
      const stones = paveStones(engagementParts(microPaveDesign(over)).parts, 'micro-pave stones');
      expect(stones.length).toBeGreaterThan(40);
      const gaps = neighbourGaps(stones, 4);
      for (const g of gaps) {
        // no two stones run into each other
        expect(g[0]).toBeGreaterThan(-0.02);
        // hexagonal packing: every stone has at least two neighbours (along its row and diagonally in the next
        // one) within 8 % of a stone
        expect(g[1]).toBeLessThan(0.08);
      }
      // and inside the field (not on an outer row or at the head) four of them
      const inner = gaps.filter((g) => g[3] < 0.08).length;
      expect(inner / gaps.length).toBeGreaterThan(over.rows === 3 ? 0.25 : 0.5);
    }
  });

  it('sizes the stones from the rows and the band width', () => {
    const six = paveStones(engagementParts(microPaveDesign({})).parts, 'micro-pave stones');
    const three = paveStones(engagementParts(microPaveDesign({ rows: 3 })).parts, 'micro-pave stones');
    const mean = (xs: { d: number }[]) => xs.reduce((n, x) => n + x.d, 0) / xs.length;
    // half the rows across the same dome: stones about twice the size
    expect(mean(three) / mean(six)).toBeGreaterThan(1.6);
    // six rows on a 3.8 to 4 mm band: about 1 mm stones, whatever stoneSizeMm says
    expect(mean(six)).toBeGreaterThan(0.85);
    expect(mean(six)).toBeLessThan(1.3);
  });

  it('climbs the shoulders up under the head', () => {
    const stones = paveStones(engagementParts(microPaveDesign({})).parts, 'micro-pave stones');
    // the highest stones sit well up the shoulders, within 40 degrees of the top
    const topAngle = Math.min(...stones.map((s) => Math.abs(Math.atan2(s.c.x, s.c.y))));
    expect(topAngle).toBeLessThan((40 * Math.PI) / 180);
  });

  it('stays inside the triangle budget at the densest settings', () => {
    const dense = engagementParts(microPaveDesign({ rows: 8, stoneSizeMm: 0.8, coverage: 1 })).parts;
    const t = measure(dense, 'shank-metal').tris + measure(dense, 'accent-stone').tris;
    expect(t).toBeLessThan(TRI_BUDGET);
  });
});

describe('graded single-row pave (r3-003)', () => {
  const design = (params: Record<string, number | string>): Design => {
    const base = exampleDesigns.find((d) => d.id === 'r3-003');
    if (!base?.engagement) throw new Error('r3-003 missing');
    const d = JSON.parse(JSON.stringify(base)) as Design;
    d.engagement.shank.params = { ...d.engagement.shank.params, ...params };
    return d;
  };
  const shankStones = (parts: Part[]) => parts.filter((p) => /pave stones/.test(p.label ?? ''));
  const lightness = (hex: string) =>
    [1, 3, 5].reduce((a, i) => a + parseInt(hex.slice(i, i + 2), 16), 0) / (3 * 255);

  it('is off by default: one plain group of equal stones', () => {
    const parts = shankStones(engagementParts(design({ grade: 'none' })).parts);
    expect(parts).toHaveLength(1);
    expect(parts[0].geometry.userData.gemHex).toBeUndefined();
  });

  it('shades the stones step by step from the accent colour at the head to the grade colour outermost', () => {
    const parts = shankStones(engagementParts(design({ grade: 'color', gradeColor: 'black' })).parts);
    const hexes = parts.map((p) => p.geometry.userData.gemHex as string | undefined);
    expect(hexes[0]).toBeUndefined(); // the stones next to the head keep the accent colour
    const graded = hexes.slice(1) as string[];
    expect(graded.length).toBeGreaterThan(4);
    expect(graded[graded.length - 1]).toBe('#1b1b1f');
    for (let i = 1; i < graded.length; i++)
      expect(lightness(graded[i])).toBeLessThan(lightness(graded[i - 1]));
    // one stone per side in every colour step
    const per = parts[0].geometry.getAttribute('position').count;
    for (const p of parts) expect(p.geometry.getAttribute('position').count).toBe(per);
  });

  it('tapers the stones in size from the head outward and narrows the row', () => {
    const plain = measure(engagementParts(design({ grade: 'none' })).parts, 'accent-stone');
    const parts = engagementParts(design({ grade: 'size', gradeTo: 0.6 })).parts;
    const stones = shankStones(parts);
    expect(stones).toHaveLength(1);
    const pos = stones[0].geometry.getAttribute('position');
    const n = buildStone(
      getModel('cut', 'round-brilliant'),
      { length: 1, width: 1, depth: 0.6 },
      { detail: 'low' },
    ).geometry;
    const v = (n.index ? n.toNonIndexed() : n).getAttribute('position').count;
    // stones on one side, in order from the head: their span across the band (z) shrinks
    const widths: { a: number; w: number }[] = [];
    for (let s = 0; s + v <= pos.count; s += v) {
      let lo = Infinity;
      let hi = -Infinity;
      let x = 0;
      let y = 0;
      for (let i = s; i < s + v; i++) {
        lo = Math.min(lo, pos.getZ(i));
        hi = Math.max(hi, pos.getZ(i));
        x += pos.getX(i);
        y += pos.getY(i);
      }
      if (x > 0) widths.push({ a: Math.atan2(x, y), w: hi - lo });
    }
    widths.sort((p, q) => p.a - q.a);
    expect(widths[widths.length - 1].w / widths[0].w).toBeCloseTo(0.6, 1);
    for (let i = 1; i < widths.length; i++) expect(widths[i].w).toBeLessThan(widths[i - 1].w + 1e-6);
    const m = measure(parts, 'accent-stone');
    expect(m.tris).toBeLessThan(TRI_BUDGET);
    expect(m.maxZ).toBeLessThanOrEqual(plain.maxZ + 1e-6);
  });

  it('stays inside the triangle budget and reports graded stones by colour in the spec', () => {
    const d = design({ grade: 'both', gradeTo: 0.8, gradeColor: 'black' });
    const parts = engagementParts(d).parts;
    expect(measure(parts, 'shank-metal').tris + measure(parts, 'accent-stone').tris).toBeLessThan(TRI_BUDGET);
    const spec = computeSpec(d, 'engagement');
    const names = spec.stones.filter((s) => s.role === 'accent').map((s) => s.colorName);
    expect(names).toContain('Colorless');
    expect(names).toContain('Black');
    expect(names.some((x) => /^Graded \(#[0-9a-f]{6}\)$/.test(x))).toBe(true);
  });
});
