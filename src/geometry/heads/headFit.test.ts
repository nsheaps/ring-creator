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

// ---------------------------------------------------------------------------------------------
// Multi-stone and halo heads: every extra stone is seated, held and placed like a jeweller would
// ---------------------------------------------------------------------------------------------

/** Split a merged stone part into its separate stones (facets of one stone share exact vertex positions). */
function stonesOf(parts: Part[]): THREE.Vector3[][] {
  const pts: THREE.Vector3[] = [];
  for (const p of parts) {
    const pos = p.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i));
  }
  const parent = pts.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const join = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  const seen = new Map<string, number>();
  pts.forEach((v, i) => {
    if (i % 3) join(i, i - (i % 3));
    const k = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
    const j = seen.get(k);
    if (j === undefined) seen.set(k, i);
    else join(i, j);
  });
  const groups = new Map<number, THREE.Vector3[]>();
  pts.forEach((v, i) => {
    const r = find(i);
    const g = groups.get(r) ?? [];
    g.push(v);
    groups.set(r, g);
  });
  return [...groups.values()];
}

const centroid = (vs: THREE.Vector3[]) =>
  vs.reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / vs.length);

/** Angular bins (around the stone's own axis) in which head metal touches the stone near its girdle. */
function gripBins(
  stone: THREE.Vector3[],
  metal: Tri[],
  axis: THREE.Vector3,
  c: THREE.Vector3,
  bins = 12,
): number {
  const rad = (v: THREE.Vector3) => v.clone().sub(c).projectOnPlane(axis);
  const rMax = Math.max(...stone.map((v) => rad(v).length()));
  const ref = rad(stone.find((v) => rad(v).length() > rMax * 0.9) ?? stone[0]).normalize();
  const ref2 = axis.clone().cross(ref);
  const hitBins = new Set<number>();
  for (const v of stone) {
    const d = rad(v);
    if (d.length() < rMax * 0.85) continue;
    if (distTo(metal, v, 0.3) > 0.3) continue;
    const a = Math.atan2(d.dot(ref2), d.dot(ref));
    hitBins.add(Math.floor(((a + Math.PI) / (2 * Math.PI)) * bins) % bins);
  }
  return hitBins.size;
}

function ringDesign(head: string, cut: string, extra: Partial<Design['engagement']> = {}): Design {
  const d = design(head, cut);
  d.engagement.accentStone = { ...d.engagement.accentStone, cut: 'round-brilliant', sizeMm: 1.6 };
  Object.assign(d.engagement, extra);
  return d;
}

describe('side stones sit low on the shoulders, follow the curve and are held (ring frame)', () => {
  const cases: [string, string, number][] = [
    ['three-stone', 'round-brilliant', 2],
    ['three-stone', 'oval', 2],
    ['three-stone', 'emerald-cut', 2],
    ['five-stone', 'round-brilliant', 4],
    ['five-stone', 'oval', 4],
  ];
  for (const [head, cut, count] of cases) {
    it(`${head} / ${cut}`, () => {
      const { parts, seatY, girdleY } = engagementParts(ringDesign(head, cut));
      const metal = trianglesOf(
        parts.filter((p) => p.slot === 'head-metal'),
        () => true,
      );
      const sides = stonesOf(parts.filter((p) => p.slot === 'accent-stone'));
      expect(sides.length).toBe(count);
      // sorted along the band; sizes graduate outward, mirrored left/right
      sides.sort((a, b) => centroid(a).x - centroid(b).x);
      for (const s of sides) {
        const c = centroid(s);
        const top = Math.max(...s.map((v) => v.y));
        expect(top, 'side stone lower than the centre girdle').toBeLessThan(girdleY - 0.3);
        // culet: the stone's point closest to the finger, just above the shank top
        const culet = s.reduce((a, v) => (Math.hypot(v.x, v.y) < Math.hypot(a.x, a.y) ? v : a));
        const clear = Math.hypot(culet.x, culet.y) - seatY;
        expect(clear, 'culet near the shank top').toBeGreaterThan(0.05);
        expect(clear, 'culet near the shank top').toBeLessThan(0.9);
        // the stone's axis (culet to centroid) points away from the finger: it follows the curve
        const axis = c.clone().sub(culet).normalize();
        const radial = new THREE.Vector3(c.x, c.y, 0).normalize();
        expect(axis.angleTo(radial), 'tilted to follow the finger').toBeLessThan(0.2);
        // held by its own prongs on several sides
        expect(gripBins(s, metal, axis, c), 'prongs around the side stone').toBeGreaterThanOrEqual(3);
        // and its basket stands on the shank
        const ang = Math.atan2(c.y, c.x);
        const foot = radialMin(
          parts.filter((p) => p.slot === 'head-metal'),
          (v) => Math.abs(Math.atan2(v.y, v.x) - ang) < 0.1 && Math.abs(v.z) < 1,
        );
        expect(foot - seatY, 'side basket reaches the shank').toBeLessThan(0.06);
      }
      // left and right mirror each other, the outer pair is lower than the inner pair
      const cs = sides.map(centroid);
      expect(cs[0].x).toBeCloseTo(-cs[cs.length - 1].x, 1);
      if (count === 4) expect(cs[0].y).toBeLessThan(cs[1].y - 0.3);
    });
  }
});

describe('pairs: both stones seated on the shank, centred on the finger', () => {
  for (const [head, cut, second] of [
    ['toi-et-moi', 'emerald-cut', 'pear'],
    ['toi-et-moi', 'round-brilliant', 'match'],
    ['toi-et-moi', 'oval', 'accent'],
    ['bypass-head', 'oval', 'match'],
    ['bypass-head', 'round-brilliant', 'pear'],
  ] as const) {
    it(`${head} / ${cut} + ${second}`, () => {
      const d = ringDesign(head, cut);
      d.engagement.head.params = { secondCut: second };
      const { parts, seatY } = engagementParts(d);
      const all = new THREE.Box3();
      for (const p of parts.filter((q) => q.slot !== 'shank-metal')) {
        p.geometry.computeBoundingBox();
        if (p.geometry.boundingBox) all.union(p.geometry.boundingBox);
      }
      expect(Math.abs((all.min.x + all.max.x) / 2), 'pair centred on the finger').toBeLessThan(0.45);
      const metal = trianglesOf(
        parts.filter((p) => p.slot === 'head-metal'),
        () => true,
      );
      const [centre] = stonesOf(parts.filter((p) => p.slot === 'center-stone'));
      const seconds = stonesOf(parts.filter((p) => p.slot === 'accent-stone'));
      expect(seconds.length).toBe(1);
      const clearOf = (s: THREE.Vector3[]) => Math.min(...s.map((v) => Math.hypot(v.x, v.y))) - seatY;
      const cc = clearOf(centre);
      const sc = clearOf(seconds[0]);
      expect(sc, 'second stone above the shank').toBeGreaterThan(0.1);
      expect(Math.abs(sc - cc), 'both stones equally high over the shank').toBeLessThan(0.5);
      const c = centroid(seconds[0]);
      const culet = seconds[0].reduce((a, v) => (Math.hypot(v.x, v.y) < Math.hypot(a.x, a.y) ? v : a));
      expect(
        gripBins(seconds[0], metal, c.clone().sub(culet).normalize(), c),
        'second stone held',
      ).toBeGreaterThanOrEqual(3);
      if (second === 'pear') {
        // the second stone really is a pear: longer than wide
        const box = new THREE.Box3().setFromPoints(seconds[0]);
        const size = box.getSize(new THREE.Vector3());
        expect(Math.max(size.x, size.z) / Math.min(size.x, size.z)).toBeGreaterThan(1.25);
      }
    });
  }
});

describe('halos ring the centre stone (stone frame)', () => {
  for (const head of ['halo-round', 'halo-cushion', 'halo-oval', 'double-halo']) {
    for (const cut of ['round-brilliant', 'oval', 'pear', 'emerald-cut']) {
      it(`${head} / ${cut}`, () => {
        const { ctx, parts } = stoneFrame(head, cut);
        const stone = ctx.center.built;
        const o = cleanOutline(stone.outline);
        const melee = stonesOf(parts.filter((p) => p.slot === 'accent-stone'));
        const metal = trianglesOf(
          parts.filter((p) => p.slot === 'head-metal'),
          () => true,
        );
        expect(melee.length).toBeGreaterThanOrEqual(12);
        const insets = melee.map((m) => Math.max(...m.map((v) => insetOf(o, v.x, v.z))));
        // no melee cuts into the centre stone's outline...
        expect(Math.max(...insets), 'melee outside the centre girdle').toBeLessThan(0.02);
        // ...and the inner row touches it: a follow-the-stone halo all round, a shaped halo at its nearest points
        const near = insets.filter((d) => d > -0.35).length;
        // (a double halo's outer row is about 65% of its melee)
        const share = head === 'double-halo' ? 0.35 : 1;
        if (head === 'halo-round' || head === 'double-halo')
          expect(near / melee.length, 'inner row touches the girdle').toBeGreaterThan(
            (cut === 'round-brilliant' ? 0.9 : 0.4) * share,
          );
        else expect(near, 'halo touches the girdle somewhere').toBeGreaterThanOrEqual(2);
        for (const m of melee) {
          // tables about level with the centre girdle
          const top = Math.max(...m.map((v) => v.y));
          expect(top).toBeLessThan(0.15);
          expect(top).toBeGreaterThan(-0.9);
          // each melee sits in the halo plate
          const culet = m.reduce((a, v) => (v.y < a.y ? v : a));
          expect(distTo(metal, culet, 0.4), 'melee seated in the plate').toBeLessThan(0.4);
        }
        // the halo is joined to the seat: metal runs from the plate down to the shank seat
        const low = Math.min(...metal.map((t) => t.box.min.y));
        expect(low).toBeLessThan(-ctx.baseDrop + 0.15);
      });
    }
  }

  it('hidden halo tucks under the girdle, hugging the pavilion', () => {
    for (const cut of ['round-brilliant', 'oval', 'cushion']) {
      const { ctx, parts } = stoneFrame('hidden-halo', cut);
      const stone = ctx.center.built;
      const o = cleanOutline(stone.outline);
      const melee = stonesOf(parts.filter((p) => p.slot === 'accent-stone'));
      expect(melee.length).toBeGreaterThanOrEqual(8);
      for (const m of melee) {
        expect(Math.max(...m.map((v) => v.y)), 'below the girdle').toBeLessThan(-stone.girdleThickness * 0.5);
        expect(Math.max(...m.map((v) => v.y)), 'right under the girdle').toBeGreaterThan(-1.2);
        const c = centroid(m);
        expect(insetOf(o, c.x, c.z), 'hugs the outline').toBeGreaterThan(-1.2);
        // clear of the pavilion
        for (const v of m) {
          const s = stoneSurfaceY(stone, v.x, v.z, 'bottom');
          if (s !== null) expect(v.y, 'melee outside the pavilion').toBeLessThan(s + 0.02);
        }
      }
    }
  });

  it('cluster petals are equal, evenly spaced and touch the centre and each other', () => {
    for (const cut of ['round-brilliant', 'oval', 'old-european']) {
      const { ctx, parts } = stoneFrame('cluster', cut);
      const o = cleanOutline(ctx.center.built.outline);
      const petals = stonesOf(parts.filter((p) => p.slot === 'accent-stone'));
      expect(petals.length).toBeGreaterThanOrEqual(6);
      const cs = petals.map(centroid).sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));
      const sizes = petals.map((m) => {
        const b = new THREE.Box3().setFromPoints(m);
        return b.max.y - b.min.y;
      });
      expect(Math.max(...sizes) - Math.min(...sizes), 'petals all the same').toBeLessThan(0.01);
      const ys = cs.map((c) => c.y);
      expect(Math.max(...ys) - Math.min(...ys), 'petals level').toBeLessThan(0.01);
      // neighbours touch (or nearly): gaps between petal outlines stay small and even
      const dists = cs.map((c, i) => c.distanceTo(cs[(i + 1) % cs.length]));
      expect(Math.max(...dists) / Math.min(...dists), 'evenly spaced').toBeLessThan(1.35);
      for (const m of petals) {
        const inset = Math.max(...m.map((v) => insetOf(o, v.x, v.z)));
        expect(inset, 'petal outside the centre').toBeLessThan(0.02);
        expect(inset, 'petal touches the centre').toBeGreaterThan(-0.6);
      }
    }
  });
});
