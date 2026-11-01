/** Cluster-flank fan: a compact cluster hugging the centre stone, below its crown and never over it. */
import { describe, expect, it } from 'vitest';
import { headBuilders } from '../builders';
import type { Part } from '../types';
import { heads } from '@/models/data/heads';
import type { Params } from '@/models/types';
import './index';
import { cleanOutline, support } from './common';
import { stubCtx } from './testStub';

function fan(bandAxis: [number, number], params: Params = {}, cut = 'oval') {
  const model = heads.find((h) => h.id === 'cluster-flank');
  if (!model) throw new Error('cluster-flank');
  const fn = headBuilders.get(model.builder);
  if (!fn) throw new Error(model.builder);
  const ctx = stubCtx({ cut, params: { ...model.params, arrangement: 'fan', ...params }, bandAxis });
  return { ctx, parts: fn(ctx) };
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
});
