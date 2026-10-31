/**
 * Fit tests for heads with the REAL stone builders and shanks: the stone sits on its head (girdle gripped, prong tips
 * on the crown, bezels hugging the girdle) and the head joins the shank without a gap.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import '@/models/data';
import '@/geometry';
import { headBuilders } from '../builders';
import { buildStone, engagementParts, resolveAccent, resolveCenter } from '../assemble';
import type { HeadCtx, Part } from '../types';
import { getModel } from '@/models/registry';
import { heads } from '@/models/data/heads';
import { exampleDesigns } from '@/models/data/examples';
import type { Design } from '@/models/types';
import { autoWireMm, cleanOutline, pointAt, stoneSurfaceY, type CleanOutline } from './common';

const CUTS = [
  'round-brilliant',
  'oval',
  'princess',
  'pear',
  'marquise',
  'emerald-cut',
  'cushion',
  'heart',
] as const;
const COLLARS = new Set(['bezel-full', 'flush-gypsy']);
const OPEN = new Set(['bezel-half', 'tension']);

const base = exampleDesigns.find((d) => d.id === 'r1-003');
if (!base) throw new Error('example r1-003 missing');

function design(head: string, cut: string, o: Partial<Design['engagement']['placement']> = {}): Design {
  const d = JSON.parse(JSON.stringify(base)) as Design;
  d.engagement.head = { ...d.engagement.head, id: head, params: {} };
  d.engagement.center.cut = cut;
  d.engagement.center.carat = 1;
  d.engagement.placement = { ...d.engagement.placement, raise: 1.2, ...o };
  return d;
}

/** Head built in the stone frame around a real stone (the way the assembler calls it). */
function stoneFrame(head: string, cut: string, bandAxis: [number, number] = [0, 1]) {
  const d = design(head, cut);
  const center = resolveCenter(d.engagement.center);
  const model = getModel('head', head);
  const fn = headBuilders.get(model.builder);
  if (!fn) throw new Error(head);
  const b = center.built;
  const ctx: HeadCtx = {
    center,
    accent: resolveAccent(d.engagement.accentStone),
    params: { ...model.params },
    baseDrop: d.engagement.placement.raise + b.pavilionDepth + b.girdleThickness / 2,
    shankWidth: 2,
    bandAxis,
    innerRadius: 8.4,
    stone: (id, dims, opts) => buildStone(getModel('cut', id), dims, opts),
  };
  return { ctx, parts: fn(ctx) };
}

interface Tri {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
  box: THREE.Box3;
}
function trianglesOf(parts: Part[], keep: (box: THREE.Box3) => boolean): Tri[] {
  const out: Tri[] = [];
  for (const p of parts) {
    const pos = p.geometry.getAttribute('position');
    for (let i = 0; i + 2 < pos.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(pos, i);
      const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
      const c = new THREE.Vector3().fromBufferAttribute(pos, i + 2);
      const box = new THREE.Box3().setFromPoints([a, b, c]);
      if (keep(box)) out.push({ a, b, c, box });
    }
  }
  return out;
}
const tmpTri = new THREE.Triangle();
const tmpP = new THREE.Vector3();
function distTo(tris: Tri[], p: THREE.Vector3, within: number): number {
  let best = Infinity;
  for (const t of tris) {
    if (t.box.distanceToPoint(p) > Math.min(best, within)) continue;
    tmpTri.set(t.a, t.b, t.c).closestPointToPoint(p, tmpP);
    best = Math.min(best, tmpP.distanceTo(p));
  }
  return best;
}

/** Runs of consecutive true values on a closed list. */
function clusters(flags: boolean[]): number[][] {
  const n = flags.length;
  const start = flags.findIndex((f) => !f);
  if (start < 0) return [flags.map((_, i) => i)];
  const out: number[][] = [];
  let cur: number[] = [];
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    if (flags[i]) cur.push(i);
    else if (cur.length) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Distance from (x, z) to the outline polygon, negative outside. */
function insetOf(o: CleanOutline, x: number, z: number): number {
  let inside = false;
  let d = Infinity;
  const n = o.pts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, zi] = o.pts[i];
    const [xj, zj] = o.pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    const ex = xi - xj;
    const ez = zi - zj;
    const t = Math.max(0, Math.min(1, ((x - xj) * ex + (z - zj) * ez) / (ex * ex + ez * ez || 1)));
    d = Math.min(d, Math.hypot(x - xj - ex * t, z - zj - ez * t));
  }
  return inside ? d : -d;
}

const SAMPLES = 144;

describe('heads grip real stones (stone frame)', () => {
  for (const h of heads) {
    for (const cut of CUTS) {
      it(`${h.id} / ${cut}`, () => {
        const { ctx, parts } = stoneFrame(h.id, cut);
        const stone = ctx.center.built;
        const metal = parts.filter((p) => p.slot === 'head-metal');
        const o = cleanOutline(stone.outline);
        const near = trianglesOf(metal, (b) => b.min.y < 1.2 && b.max.y > -1.2);
        const grip = 0.25; // metal within this distance of the girdle edge
        const pts = Array.from({ length: SAMPLES }, (_, i) => pointAt(o, (i / SAMPLES) * o.perimeter));
        // collars and jaws grip the girdle itself; prong posts must touch the stone just under the girdle edge
        const yProbe = COLLARS.has(h.id) || OPEN.has(h.id) ? 0 : -stone.girdleThickness * 0.5 - 0.12;
        const held = pts.map((p) => distTo(near, new THREE.Vector3(p.x, yProbe, p.z), grip) <= grip);
        const runs = clusters(held);
        const frac = held.filter(Boolean).length / SAMPLES;
        if (COLLARS.has(h.id)) expect(frac, 'collar hugs the whole girdle').toBeGreaterThan(0.97);
        else if (h.id === 'bezel-half') expect(frac).toBeGreaterThan(0.3);
        else if (h.id === 'tension') expect(runs.length, 'two jaws').toBeGreaterThanOrEqual(2);
        else if (runs.length < 3 && h.id.includes('halo'))
          // a halo frame may run right along the girdle and join the prong grips into longer runs
          expect(frac, 'prongs and halo frame around the girdle').toBeGreaterThan(0.5);
        else expect(runs.length, 'prongs touching the girdle').toBeGreaterThanOrEqual(3);

        // Metal folds over the crown next to every grip (prong tips, bezel lip), and lies on it rather than floating.
        if (h.id === 'tension') return;
        const crownMetal: THREE.Vector3[] = [];
        for (const p of metal) {
          const pos = p.geometry.getAttribute('position');
          for (let i = 0; i < pos.count; i++) {
            const v = new THREE.Vector3().fromBufferAttribute(pos, i);
            if (v.y < stone.girdleThickness * 0.5 || v.y > stone.crownHeight + 0.8) continue;
            const inset = insetOf(o, v.x, v.z);
            if (inset < 0.08 || inset > 2) continue;
            const s = stoneSurfaceY(stone, v.x, v.z, 'top');
            if (s !== null) crownMetal.push(v.setY(v.y - s));
          }
        }
        let covered = 0;
        for (const run of runs) {
          const along = run.map((i) => pts[i]);
          const over = crownMetal.filter((v) => along.some((q) => Math.hypot(v.x - q.x, v.z - q.z) < 1.8));
          if (over.length && Math.min(...over.map((v) => v.y)) < 0.15) covered++;
        }
        expect(covered, 'grips with metal resting on the crown').toBeGreaterThanOrEqual(
          OPEN.has(h.id) ? 1 : Math.max(1, Math.ceil(runs.length * 0.75)),
        );
        // ...but the setting stays below the table
        const top = Math.max(
          ...metal.map((p) => (p.geometry.computeBoundingBox(), p.geometry.boundingBox?.max.y ?? 0)),
        );
        expect(top, 'metal stays below the table').toBeLessThan(stone.crownHeight + 0.35);
      });
    }
  }
});

function radialMin(parts: Part[], filter: (v: THREE.Vector3) => boolean): number {
  let m = Infinity;
  const v = new THREE.Vector3();
  for (const p of parts) {
    const pos = p.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (filter(v)) m = Math.min(m, Math.hypot(v.x, v.y));
    }
  }
  return m;
}

describe('heads join the shank (ring frame)', () => {
  const cases: [string, string, Partial<Design['engagement']['placement']>][] = [];
  for (const h of heads)
    for (const cut of ['round-brilliant', 'oval', 'pear', 'emerald-cut']) cases.push([h.id, cut, {}]);
  for (const h of ['solitaire-4-prong', 'halo-round', 'bezel-full', 'three-stone', 'tension'])
    cases.push([h, 'oval', { orientation: 'east-west' }], [h, 'marquise', { tilt: 12 }]);
  for (const [head, cut, place] of cases) {
    it(`${head} / ${cut} ${JSON.stringify(place)}`, () => {
      const { parts, seatY } = engagementParts(design(head, cut, place));
      const shank = parts.filter((p) => p.slot === 'shank-metal');
      const metal = parts.filter((p) => p.slot === 'head-metal');
      const stones = parts.filter((p) => p.slot === 'center-stone');
      const sb = new THREE.Box3();
      for (const p of shank) {
        p.geometry.computeBoundingBox();
        if (p.geometry.boundingBox) sb.union(p.geometry.boundingBox);
      }
      const halfZ = Math.min(Math.abs(sb.min.z), sb.max.z);
      // the head reaches down onto the shank's top surface (within its width) ...
      const reach = radialMin(metal, (v) => v.y > 0 && Math.abs(v.z) <= halfZ + 0.3);
      expect(reach - seatY, 'gap between head and shank').toBeLessThan(0.06);
      // ... without sinking far into it
      expect(reach - seatY).toBeGreaterThan(-1.2);
      // and the stones stay clear of the shank
      expect(radialMin(stones, (v) => v.y > 0)).toBeGreaterThan(seatY + 0.2);
      const accents = parts.filter((p) => p.slot === 'accent-stone');
      if (accents.length)
        expect(
          radialMin(accents, (v) => v.y > 0),
          'accent stones above the shank',
        ).toBeGreaterThan(seatY);
    });
  }
});

describe('realistic proportions (1 ct round, six prongs, raise 1.2 mm)', () => {
  it('head height, prong wire and tips', () => {
    const { ctx, parts } = stoneFrame('solitaire-6-prong', 'round-brilliant');
    const s = ctx.center.built;
    const wire = autoWireMm(s);
    expect(wire).toBeGreaterThan(0.9);
    expect(wire).toBeLessThan(1.15);
    const box = new THREE.Box3();
    for (const p of parts.filter((q) => q.slot === 'head-metal')) {
      p.geometry.computeBoundingBox();
      if (p.geometry.boundingBox) box.union(p.geometry.boundingBox);
    }
    // seat to table about 5 mm
    const height = s.crownHeight - box.min.y;
    expect(height).toBeGreaterThan(4);
    expect(height).toBeLessThan(5.6);
    // prong tips rise over the girdle but stay below the table
    expect(box.max.y).toBeGreaterThan(0.3);
    expect(box.max.y).toBeLessThan(s.crownHeight);
    // the head is no wider than the stone plus the prongs
    const R = ctx.center.dims.length / 2;
    expect(box.max.x).toBeLessThan(R + wire * 1.2);
    expect(box.max.x).toBeGreaterThan(R);
  });
});
