import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import '@/models/data';
import '@/geometry';
import { buildStone, resolveAccent } from '@/geometry/assemble';
import { getModel } from '@/models/registry';
import type { Params } from '@/models/types';
import { shankBuilders } from '../builders';
import type { Part, ResolvedStone, ShankCtx } from '../types';

function ctx(params: Params, sizeMm: number, headHalf = 3.5): ShankCtx {
  return {
    innerRadius: 8.5,
    center: {} as ResolvedStone,
    accent: resolveAccent({ material: 'diamond', color: 'colorless', cut: 'round-brilliant', sizeMm }),
    params,
    headHalfAlongBand: headHalf,
    headHalfAlongFinger: headHalf,
    stone: (cutId, dims, opts) => buildStone(getModel('cut', cutId), dims, opts),
  };
}

/** Girdle centre and diameter of every accent stone (the farthest pair of a stone's vertices spans its girdle). */
function stones(parts: Part[]): { c: THREE.Vector3; d: number }[] {
  const per = buildStone(
    getModel('cut', 'round-brilliant'),
    { length: 1, width: 1, depth: 0.6 },
    { detail: 'low' },
  ).geometry;
  const v = (per.index ? per.toNonIndexed() : per).getAttribute('position').count;
  const out: { c: THREE.Vector3; d: number }[] = [];
  for (const p of parts.filter((q) => q.slot === 'accent-stone')) {
    const pos = p.geometry.getAttribute('position');
    expect(pos.count % v).toBe(0);
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

describe('pavé on path shanks', () => {
  const cases: { id: string; params: Params }[] = [];
  for (const id of ['split', 'twisted', 'crossover', 'bypass'])
    for (const coverage of [0.45, 0.6, 0.8, 1])
      cases.push({ id, params: { ...getModel('shank', id).params, pave: true, coverage } });

  it.each(cases)('never lets two stones overlap ($id, coverage $params.coverage)', ({ id, params }) => {
    const build = shankBuilders.get(id);
    if (!build) throw new Error(`no builder ${id}`);
    for (const size of [1.2, 1.6])
      for (const headHalf of [2.5, 3.5]) {
        const all = stones(build(ctx(params, size, headHalf)).parts);
        expect(all.length).toBeGreaterThan(0);
        for (let i = 0; i < all.length; i++)
          for (let j = i + 1; j < all.length; j++) {
            const a = all[i];
            const b = all[j];
            // girdles may touch but not cut into each other. Stones lie tilted on a curved strand, so the straight
            // distance between their sunken girdle centres reads a few per cent short of the real clearance.
            const gap = (a.c.distanceTo(b.c) - (a.d + b.d) / 2) / Math.min(a.d, b.d);
            expect(gap, `${id} size ${size}: stones ${i} and ${j}`).toBeGreaterThan(-0.05);
          }
      }
  });

  it('ends the split shank pavé before the arms converge (r2-012: 1.6 mm stones, coverage 0.6)', () => {
    const build = shankBuilders.get('split');
    if (!build) throw new Error('no split builder');
    const all = stones(
      build(ctx({ ...getModel('shank', 'split').params, pave: true, coverage: 0.6 }, 1.6)).parts,
    );
    // the arms still carry stones on both shoulders
    expect(all.length).toBeGreaterThanOrEqual(8);
  });
});

describe('bypass shank blade ends', () => {
  const build = (extra: Params) => {
    const fn = shankBuilders.get('bypass');
    if (!fn) throw new Error('bypass');
    return fn(ctx({ ...getModel('shank', 'bypass').params, ...extra }, 1.2));
  };
  /** angle (degrees) from the top of every shank vertex in the upper half */
  const topAngles = (parts: Part[]) => {
    const out: number[] = [];
    for (const p of parts.filter((q) => q.slot === 'shank-metal')) {
      const a = p.geometry.getAttribute('position');
      for (let i = 0; i < a.count; i++)
        if (a.getY(i) > 0) out.push((Math.abs(Math.atan2(a.getX(i), a.getY(i))) * 180) / Math.PI);
    }
    return out;
  };

  it('by default the ends pass over the top and no ends are reported', () => {
    const res = build({});
    expect(res.ends).toBeUndefined();
    expect(Math.min(...topAngles(res.parts))).toBeLessThan(1);
  });

  it("with ends 'blade' both ends stop endDeg from the top at full width and report where", () => {
    for (const hand of ['right', 'left'])
      for (const endDeg of [25, 40, 55]) {
        const res = build({ ends: 'blade', endDeg, hand, widthMm: 2.4, topWidthMm: 2.4 });
        expect(Math.min(...topAngles(res.parts))).toBeGreaterThan(endDeg - 0.01);
        const e = res.ends;
        if (!e) throw new Error('no ends');
        expect((e.angle * 180) / Math.PI).toBeCloseTo(endDeg, 6);
        const zs = e.profile.map(([z]) => z);
        const rs = e.profile.map(([, r]) => r);
        // no tip taper or rounded nose: the end keeps the band's section
        expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(2.35);
        expect(Math.min(...rs)).toBeCloseTo(8.5, 3);
        // the +X end sits on +Z for a right-hand swirl, -Z for a left-hand one
        expect(Math.sign(e.z)).toBe(hand === 'right' ? 1 : -1);
        // the reported end is where the metal really ends: a vertex of the shank sits on its outer edge
        const outer = Math.max(...rs);
        const end = res.parts
          .filter((q) => q.slot === 'shank-metal')
          .some((q) => {
            const a = q.geometry.getAttribute('position');
            for (let i = 0; i < a.count; i++) {
              const x = a.getX(i);
              const y = a.getY(i);
              if (
                x > 0 &&
                Math.abs(Math.atan2(x, y) - e.angle) < 1e-4 &&
                Math.abs(Math.hypot(x, y) - outer) < 1e-3
              )
                return true;
            }
            return false;
          });
        expect(end).toBe(true);
      }
  });

  it('blade ends with pavé keep a plain section at the end and no stones beyond it', () => {
    const res = build({ ends: 'blade', endDeg: 30, pave: true, coverage: 0.6 });
    const all = stones(res.parts);
    expect(all.length).toBeGreaterThan(4);
    for (const s of all) expect((Math.abs(Math.atan2(s.c.x, s.c.y)) * 180) / Math.PI).toBeGreaterThan(30);
    const e = res.ends;
    if (!e) throw new Error('no ends');
    const plain = build({ ends: 'blade', endDeg: 30 }).ends;
    if (!plain) throw new Error('no ends');
    // same section as without pavé (no trough cut into the end)
    const top = (pr: [number, number][]) =>
      Math.max(...pr.filter(([z]) => Math.abs(z) < 0.2).map(([, r]) => r));
    expect(top(e.profile)).toBeGreaterThan(top(plain.profile) - 0.05);
  });
});
