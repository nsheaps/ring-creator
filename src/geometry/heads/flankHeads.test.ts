/** Cluster-flank fan: a compact cluster hugging the centre stone, below its crown and never over it. */
import { describe, expect, it } from 'vitest';
import { headBuilders } from '../builders';
import type { Part } from '../types';
import { heads } from '@/models/data/heads';
import type { Params } from '@/models/types';
import './index';
import { cleanOutline, support } from './common';
import { ellipsesOverlap } from './flankHeads';
import { stubCtx } from './testStub';
import type { StoneBuildOptions } from '../types';
import type { StoneDims } from '@/models/stoneMath';

function fan(bandAxis: [number, number], params: Params = {}, cut = 'oval') {
  const model = heads.find((h) => h.id === 'cluster-flank');
  if (!model) throw new Error('cluster-flank');
  const fn = headBuilders.get(model.builder);
  if (!fn) throw new Error(model.builder);
  const base = stubCtx({ cut, params: { ...model.params, arrangement: 'fan', ...params }, bandAxis });
  const calls: { id: string; dims: StoneDims; opts?: StoneBuildOptions }[] = [];
  const ctx = {
    ...base,
    stone: (id: string, dims: StoneDims, opts?: StoneBuildOptions) => {
      calls.push({ id, dims, opts });
      return base.stone(id, dims, opts);
    },
  };
  return { ctx, parts: fn(ctx), calls };
}

/** Accent vertices in (u along the band, v across it, y). */
function accentUV(parts: Part[], [ax, az]: [number, number]): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const p of parts.filter((q) => q.slot === 'accent-stone')) {
    const pos = p.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      out.push([x * ax + z * az, -x * az + z * ax, pos.getY(i)]);
    }
  }
  return out;
}

describe('cluster-flank fan', () => {
  for (const axis of [
    [0, 1],
    [1, 0],
  ] as [number, number][]) {
    it(`hugs the centre on both sides without covering it (band axis ${axis.join(',')})`, () => {
      const { ctx, parts } = fan(axis, { flankCount: 3, flankRatio: 0.3 });
      const o = cleanOutline(ctx.center.built.outline);
      const [ax, az] = axis;
      const halfU = support(o, ax, az);
      const halfV = support(o, -az, ax);
      const pts = accentUV(parts, axis);
      expect(pts.length).toBeGreaterThan(0);
      const us = pts.map((q) => q[0]);
      const vs = pts.map((q) => Math.abs(q[1]));
      // stones on both sides of the centre
      expect(Math.min(...us)).toBeLessThan(-halfU);
      expect(Math.max(...us)).toBeGreaterThan(halfU);
      // compact: the fan stays within the centre's own extent across the band (no sunburst above and below it) ...
      expect(Math.max(...vs)).toBeLessThan(halfV * 1.1);
      // ... and does not reach out along the band much further than the centre stone is long across it
      expect(Math.max(...us.map(Math.abs)) - halfU).toBeLessThan(halfV * 1.3);
      // nothing sits over the centre stone: every accent point lies outside its outline (along the band)
      const inside = pts.filter(
        ([u, v]) => Math.abs(u) < halfU * Math.sqrt(Math.max(0, 1 - (v / halfV) ** 2)) - 0.05,
      );
      expect(inside.length, JSON.stringify(inside.slice(0, 8))).toBe(0);
      // level with the centre's girdle, well below its table, so the centre stays on top
      const ys = pts.map((q) => q[2]);
      expect(Math.max(...ys)).toBeLessThan(ctx.center.built.crownHeight * 0.75);
      expect(Math.max(...ys)).toBeGreaterThan(0);
    });
  }

  it('stays bounded and finite for every stone count and fan cut', () => {
    for (const n of [1, 2, 3, 4, 5])
      for (const fanCut of ['marquise', 'pear', 'oval', 'round', 'accent']) {
        const { parts } = fan([0, 1], { flankCount: n, fanCut });
        for (const [u, v, y] of accentUV(parts, [0, 1])) {
          expect(Number.isFinite(u + v + y)).toBe(true);
          expect(Math.abs(u)).toBeLessThan(14);
          expect(Math.abs(v)).toBeLessThan(8);
        }
      }
  });

  it('builds side stones with real proportions: full facets, depth 60% of width, marquise 2:1, pear 1.6:1', () => {
    for (const [fanCut, id, aspect] of [
      ['marquise', 'marquise', 2],
      ['pear', 'pear', 1.6],
      ['oval', 'oval', 1.4],
    ] as const) {
      const { calls } = fan([0, 1], { flankCount: 3, fanCut });
      const shaped = calls.filter((c) => c.id === id);
      expect(shaped.length, fanCut).toBe(6);
      for (const c of shaped) {
        expect(c.dims.length / c.dims.width, fanCut).toBeCloseTo(aspect, 2);
        expect(c.dims.depth / c.dims.width, fanCut).toBeCloseTo(0.6, 2);
      }
      for (const c of calls) expect(c.opts?.detail, `${fanCut} ${c.id}`).toBe('full');
    }
  });

  it('round fan with one stone per side is a trio of equal rounds', () => {
    const { calls } = fan([0, 1], { flankCount: 1, fanCut: 'round', flankRatio: 0.17 }, 'emerald-cut');
    expect(calls.length).toBe(6);
    for (const c of calls) {
      expect(c.id).toBe('round-brilliant');
      expect(c.dims.width).toBeCloseTo(calls[0].dims.width, 6);
    }
  });

  it('flankTaper sets the outer marquises against the long middle one (a sunburst)', () => {
    for (const taper of [0.7, 0.85, 1]) {
      const { calls } = fan([0, 1], { flankCount: 3, fanCut: 'marquise', flankTaper: taper });
      const lens = calls.filter((c) => c.id === 'marquise').map((c) => c.dims.length);
      expect(Math.min(...lens) / Math.max(...lens), `taper ${taper}`).toBeCloseTo(taper, 3);
    }
  });

  it('a round trio sits snug and low: below the centre girdle, clear of the shank, beside the centre', () => {
    const axis: [number, number] = [0, 1];
    const { ctx, parts } = fan(axis, { flankCount: 1, fanCut: 'round', flankRatio: 0.21 }, 'emerald-cut');
    const o = cleanOutline(ctx.center.built.outline);
    const halfU = support(o, 0, 1);
    const groups = stoneGroups(parts, axis);
    expect(groups.length).toBe(6);
    for (const g of groups) {
      const top = Math.max(...g.map((q) => q[2]));
      const low = Math.min(...g.map((q) => q[2]));
      // settled well below the girdle, beside the centre's pavilion (not perched level with it on long stems) ...
      expect(top).toBeLessThan(-ctx.center.built.pavilionDepth * 0.4);
      // ... but still above the top of the shank
      expect(low).toBeGreaterThan(-ctx.baseDrop - 1.5);
      // the stone nearest the centre touches its side, within 0.6 mm
      const inner = Math.min(...g.map((q) => Math.abs(q[0])));
      expect(inner).toBeGreaterThan(halfU - 0.05);
    }
    const nearest = Math.min(...groups.map((g) => Math.min(...g.map((q) => Math.abs(q[0])))));
    expect(nearest - halfU).toBeLessThan(0.6);
  });

  it('no two flank stones overlap, for every count and fan cut', () => {
    for (const n of [1, 2, 3, 4, 5])
      for (const fanCut of ['marquise', 'pear', 'oval', 'round'])
        for (const cut of ['oval', 'emerald-cut', 'round-brilliant']) {
          const { parts } = fan([0, 1], { flankCount: n, fanCut }, cut);
          const hulls = stoneHulls(parts, [0, 1]);
          for (let i = 0; i < hulls.length; i++)
            for (let j = i + 1; j < hulls.length; j++)
              expect(convexOverlap(hulls[i], hulls[j]), `${cut} ${fanCut} n=${n} stones ${i},${j}`).toBe(
                false,
              );
        }
  });

  it('stands up around the centre: stones lean outward, step down towards the shoulders and rise on stems', () => {
    const axis: [number, number] = [0, 1];
    const { ctx, parts } = fan(axis, { flankCount: 3, flankRatio: 0.3, fanCut: 'marquise' });
    const mean = (g: [number, number, number][], k: 0 | 1 | 2) => g.reduce((a, q) => a + q[k], 0) / g.length;
    const right = stoneGroups(parts, axis).filter((g) => mean(g, 0) > 0);
    expect(right.length).toBeGreaterThanOrEqual(5);
    // tiered: the stone furthest along the band sits clearly lower than the one nearest the centre
    const byU = [...right].sort((a, b) => mean(a, 0) - mean(b, 0));
    expect(mean(byU[byU.length - 1], 2)).toBeLessThan(mean(byU[0], 2) - 0.3);
    // each stone leans away from the centre: its girdle is higher on the side facing the centre than on the far side
    for (const g of right) {
      const cu = mean(g, 0);
      const cv = mean(g, 1);
      const r = Math.hypot(cu, cv);
      const along = (q: [number, number, number]) => ((q[0] - cu) * cu + (q[1] - cv) * cv) / r;
      const near = g.filter((q) => along(q) < -0.3);
      const far = g.filter((q) => along(q) > 0.3);
      expect(Math.max(...near.map((q) => q[2]))).toBeGreaterThan(Math.max(...far.map((q) => q[2])) + 0.15);
    }
    // the metal reaches down to the shank top beside the centre (stems from the shoulders), not only under it
    const o = cleanOutline(ctx.center.built.outline);
    const halfU = support(o, 0, 1);
    let lowOut = Infinity;
    for (const p of parts.filter((q) => q.slot !== 'accent-stone')) {
      const pos = p.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++)
        if (Math.abs(pos.getZ(i)) > halfU * 1.1) lowOut = Math.min(lowOut, pos.getY(i));
    }
    expect(lowOut).toBeLessThan(-ctx.baseDrop);
  });

  it('ellipsesOverlap detects touching and separated girdles', () => {
    const e = (u: number, v: number) => ({ u, v, du: 1, dv: 0, a: 1, b: 0.5 });
    expect(ellipsesOverlap(e(0, 0), e(1.9, 0), 0)).toBe(true);
    expect(ellipsesOverlap(e(0, 0), e(2.1, 0), 0)).toBe(false);
    expect(ellipsesOverlap(e(0, 0), e(2.1, 0), 0.1)).toBe(true);
    expect(ellipsesOverlap(e(0, 0), e(0, 1.1), 0)).toBe(false);
  });
});

type P2 = [number, number];

/** Split the accent geometry into stones (connected by shared vertices) and return each one's (u, v) convex hull. */
function stoneHulls(parts: Part[], axis: [number, number]): P2[][] {
  return stoneGroups(parts, axis).map((g) => hull(g.map(([u, v]) => [u, v] as P2)));
}

/** Split the accent geometry into stones (connected by shared vertices): each one's (u, v, y) points. */
function stoneGroups(parts: Part[], axis: [number, number]): [number, number, number][][] {
  const pts = accentUV(parts, axis);
  const keys = pts.map((q) => q.map((x) => x.toFixed(5)).join(','));
  const parent = pts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const first = new Map<string, number>();
  keys.forEach((k, i) => {
    const f = first.get(k);
    if (f === undefined) first.set(k, i);
    else parent[find(i)] = find(f);
  });
  for (let t = 0; t + 2 < pts.length; t += 3) {
    parent[find(t + 1)] = find(t);
    parent[find(t + 2)] = find(t);
  }
  const groups = new Map<number, [number, number, number][]>();
  pts.forEach((p, i) => {
    const r = find(i);
    const g = groups.get(r) ?? [];
    g.push(p);
    groups.set(r, g);
  });
  return [...groups.values()];
}

function hull(points: P2[]): P2[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P2[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: P2[] = [];
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Separating-axis test for two convex polygons (touching within 1 micron counts as apart). */
function convexOverlap(a: P2[], b: P2[]): boolean {
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const nx = q[1] - p[1];
      const ny = p[0] - q[0];
      const proj = (s: P2[]) => s.map((r) => r[0] * nx + r[1] * ny);
      const pa = proj(a);
      const pb = proj(b);
      const len = Math.hypot(nx, ny) || 1;
      if (Math.max(...pa) < Math.min(...pb) + 1e-3 * len || Math.max(...pb) < Math.min(...pa) + 1e-3 * len)
        return false;
    }
  return true;
}
