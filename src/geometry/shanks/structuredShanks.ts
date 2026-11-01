/** Shanks with structure around the head: cathedral arches, split, bypass and crossover. */
import * as THREE from 'three';
import { registerShankBuilder } from '../builders';
import type { Part, ShankCtx, ShankResult } from '../types';
import {
  paveAlong,
  paveOn,
  paveSpec,
  paveZone,
  ringStrand,
  strandFrom,
  zoneWeight,
  type PaveRun,
} from './pavePath';
import { troughSection } from './stoneShanks';
import {
  beadGeometry,
  instances,
  TAU,
  TOP,
  bandSection,
  clamp,
  cubic,
  fromTop,
  metal,
  num,
  outerExpFromRoundness,
  planarFrames,
  readTaper,
  smooth,
  str,
  sweep,
  taperedBand,
  thickAt,
  tube,
  widthAt,
  finish,
} from './common';

const deg = (d: number) => (d * Math.PI) / 180;

// ---------------------------------------------------------------------------------------------
// Cathedral: a full band plus two arches that leave the shoulders and climb the sides of the head.
// ---------------------------------------------------------------------------------------------
function cathedral(ctx: ShankCtx): ShankResult {
  const p = ctx.params;
  const R = ctx.innerRadius;
  const tp = readTaper(p, { w: 2.0, wTop: 2.4, t: 1.7, tTop: 1.9, taperDeg: 70 });
  const outerExp = outerExpFromRoundness(num(p, 'roundness', 0.75, 0, 1));
  const band = taperedBand(R, tp, { outerExp, innerExp: 3, split: 0.6 });
  const seatY = R + tp.tTop;
  const archHeight = num(p, 'archHeightMm', 2.0, 0.5, 5);
  const archStart = deg(num(p, 'archStartDeg', 45, 20, 70));
  const shoulder = paveOn(ctx, 'shoulderStones')
    ? paveSpec(ctx, { max: 1.8, rim: 0.2, coverage: 0.9 })
    : null;
  let archW =
    num(p, 'archWidthMm', 0, 0, 5) || clamp(Math.min(tp.wTop, (ctx.headHalfAlongFinger || 3) * 0.7), 1.2, 4);
  // stones set on the arches need a face wide enough to hold them with a rim of metal either side
  if (shoulder) archW = Math.max(archW, shoulder.dims.width + 0.65);
  const archT = num(p, 'archThicknessMm', 1.5, 0.6, 2.5);
  const hx = clamp((ctx.headHalfAlongBand || 3) * 0.72, 1.5, 7);
  const arches: THREE.BufferGeometry[] = [];
  const stoneMs: THREE.Matrix4[] = [];
  const beadMs: THREE.Matrix4[] = [];
  for (const side of [1, -1]) {
    const th0 = TOP - side * archStart;
    const t0 = thickAt(tp, th0);
    const r0 = R + t0 * 0.5;
    const P0 = new THREE.Vector3(r0 * Math.cos(th0), r0 * Math.sin(th0), 0);
    const T0 = new THREE.Vector3(-Math.sin(th0), Math.cos(th0), 0).multiplyScalar(side); // towards the top
    const P3 = new THREE.Vector3(side * hx, seatY + archHeight, 0);
    const T1 = new THREE.Vector3(-side * 0.35, 1, 0).normalize();
    const dist = P0.distanceTo(P3);
    const path = cubic(
      P0,
      P0.clone().addScaledVector(T0, dist * 0.5),
      P3.clone().addScaledVector(T1, -dist * 0.45),
      P3,
      40,
    );
    const frames = planarFrames(path);
    const wStart = widthAt(tp, th0);
    if (shoulder) {
      // stones lie on the outer face of the arch (the side away from the head) and follow it up to the head
      const head = new THREE.Vector3(0, seatY + archHeight * 0.3, 0);
      const mid = path[path.length >> 1];
      const sgn = Math.sign(frames(path.length >> 1)[1].dot(mid.clone().sub(head))) || 1;
      const halfT = (f: number) => (t0 * 0.95 + (archT - t0 * 0.95) * smooth(f)) / 2;
      const surface = path.map((pt, i) =>
        pt.clone().addScaledVector(frames(i)[1], sgn * halfT(i / (path.length - 1)) * 0.98),
      );
      const strand = strandFrom(surface, (i) => frames(i)[1].clone().multiplyScalar(sgn));
      const s1 = strand.length * 0.8;
      const s0 = Math.max(strand.length * 0.06, s1 - shoulder.coverage * strand.length * 0.74);
      const run = paveAlong(strand, shoulder, s0, s1);
      stoneMs.push(...run.stones);
      beadMs.push(...run.beads);
    }
    arches.push(
      finish(
        tube(path, frames, (i) => {
          const f = i / (path.length - 1);
          const w = wStart + (archW - wStart) * smooth(f);
          // the arch leaves the band at full section and keeps most of it all the way up to the head
          const t = t0 * 0.95 + (archT - t0 * 0.95) * smooth(f);
          // the top of the arch rounds off where it tucks against the head instead of ending in a flat cut
          const x = clamp((f - 0.82) / 0.18, 0, 1);
          const nose = Math.max(0.15, Math.sqrt(1 - x * x));
          return bandSection({
            w: w * (0.4 + 0.6 * nose),
            t: t * nose,
            R: -(t * nose) / 2,
            outerExp: 2.6,
            innerExp: 2.6,
            split: 0.5,
            n: 16,
          }).map(([u, v]) => [u, v]);
        }),
      ),
    );
  }
  const geos = [band, ...arches];
  if (beadMs.length && shoulder) geos.push(instances(beadGeometry(shoulder.beadR, 8, 6), beadMs));
  const parts: Part[] = [metal(geos, 'cathedral shank')];
  if (stoneMs.length && shoulder)
    parts.push({
      slot: 'accent-stone',
      geometry: instances(shoulder.built.geometry, stoneMs),
      label: 'shoulder stones',
    });
  return { parts, seatY, topWidth: Math.max(tp.wTop, archW) };
}
registerShankBuilder('cathedral', cathedral);

// ---------------------------------------------------------------------------------------------
// Shared pave helpers for the strands of split, bypass and crossover shanks
// ---------------------------------------------------------------------------------------------

/** Metal and stone parts for a set of pave runs. */
function paveParts(
  label: string,
  base: THREE.BufferGeometry[],
  spec: ReturnType<typeof paveSpec>,
  runs: PaveRun[],
): Part[] {
  const stoneMs = runs.flatMap((r) => r.stones);
  const beadMs = runs.flatMap((r) => r.beads);
  const geos = [...base];
  if (beadMs.length) geos.push(instances(beadGeometry(spec.beadR, 8, 6), beadMs));
  const parts: Part[] = [metal(geos, label)];
  if (stoneMs.length)
    parts.push({
      slot: 'accent-stone',
      geometry: instances(spec.built.geometry, stoneMs),
      label: 'pave stones',
    });
  return parts;
}

/** The pave trough cut into a section, shifted sideways to u0; `zone` (0..1) fades it in and out. */
function paveSection(
  spec: ReturnType<typeof paveSpec>,
  R: number,
  w: number,
  t: number,
  outerExp: number,
  zone: number,
  u0 = 0,
  widen = zone,
): [number, number][] {
  return troughSection(R, Math.max(w, spec.need * widen), t, outerExp, 3, {
    g: spec.g,
    b: spec.bevel,
    d: spec.d * zone,
  }).map(([u, v]): [number, number] => [u + u0, v]);
}

// ---------------------------------------------------------------------------------------------
// Split: one band at the bottom that divides into two thinner bands towards the head.
// ---------------------------------------------------------------------------------------------
function split(ctx: ShankCtx): ShankResult {
  const p = ctx.params;
  const R = ctx.innerRadius;
  const tp = readTaper(p, { w: 2.2, wTop: 2.4, t: 1.7, tTop: 1.8, taperDeg: 70 });
  const outerExp = outerExpFromRoundness(num(p, 'roundness', 0.7, 0, 1));
  const splitAng = deg(num(p, 'splitAngleDeg', 55, 25, 85));
  // the arms open to roughly frame the head, leaving a clear window of finger between them
  const autoGap = clamp(2 * (ctx.headHalfAlongFinger || 3) * 0.72 - tp.wTop, 1.0, 4.5);
  const pv = paveOn(ctx) ? paveSpec(ctx, { max: 1.6, rim: 0.12 }) : null;
  if (pv) {
    tp.wBottom = Math.max(tp.wBottom, pv.need);
    tp.wTop = Math.max(tp.wTop, pv.need);
  }
  const gap = num(p, 'gapMm', 0, 0, 5) || autoGap;
  const prong = (w: number) => w * 0.55; // each half band is a bit more than half as wide
  const [a0, zoneEnd] = pv ? paveZone(ctx, pv, R + tp.tTop, splitAng - 0.05) : [0, 0];
  // the arms hold their pave width over the whole run and only then slim back, so there is no visible step
  // (computed from the zone as asked, so cutting the stones short below does not change the arms' shape)
  const wide = pv ? zoneWeight(a0 - 0.3, zoneEnd + 0.3, 0.3) : () => 0;
  /** one arm at angle th: section width, thickness and axial centre */
  const arm = (th: number, side: number) => {
    const w = widthAt(tp, th);
    const x = clamp(1 - fromTop(th) / splitAng, 0, 1);
    const s = smooth(x);
    // each arm tapers a little as it climbs towards the head
    let hw = prong(w) * (1 - 0.14 * s);
    if (pv) hw = Math.max(hw, pv.need * wide(th));
    // with pave the arms are a full band wide each, so they part at an angle (ease out) instead of peeling off
    // tangentially: that leaves room for stones on both arms closer to the split
    const open = pv ? x * (2 - x) : s;
    const c = side * ((w - hw) / 2 + open * (gap / 2 + hw / 2 - (w - hw) / 2));
    return { hw, t: thickAt(tp, th) * (1 - 0.1 * s), c };
  };
  // the arms converge towards the split, so the stones of the two arms close in on each other: the last stone
  // centre stays where the arms are still at least a stone width (plus spacing) apart, and the run ends half a
  // stone beyond it
  let a1 = zoneEnd;
  if (pv && zoneEnd > a0) {
    const apart = pv.dims.width + (pv.pitch - pv.dims.length) + 0.02;
    const rOut = R + tp.tTop;
    const step = 0.002;
    let last = a0;
    for (let a = a0; a <= zoneEnd; a += step) {
      if (2 * Math.abs(arm(TOP + a, 1).c) < apart) break;
      last = a;
    }
    a1 = Math.min(zoneEnd, last + pv.pitch / (2 * rOut));
  }
  const zone = pv ? zoneWeight(a0, a1) : () => 0;
  const lower = sweep({
    thetaStart: TOP + splitAng,
    thetaEnd: TOP + TAU - splitAng,
    segments: 120,
    profile: (th) =>
      bandSection({ w: widthAt(tp, th), t: thickAt(tp, th), R, outerExp, innerExp: 3, split: 0.6 }),
  });
  const halves: THREE.BufferGeometry[] = [];
  const over = deg(2);
  for (const side of [1, -1]) {
    halves.push(
      sweep({
        thetaStart: TOP - splitAng - over,
        thetaEnd: TOP + splitAng + over,
        segments: pv ? 120 : 64,
        profile: (th) => {
          const a = arm(th, side);
          if (pv) return paveSection(pv, R, a.hw, a.t, outerExp, zone(th), a.c, wide(th));
          return bandSection({ w: a.hw, t: a.t, R, outerExp, innerExp: 3, split: 0.6, u0: a.c });
        },
      }),
    );
  }
  const base = [lower, ...halves];
  const hwTop = Math.max(prong(tp.wTop) * 0.86, pv ? pv.need : 0);
  let parts: Part[];
  if (pv && a1 > a0) {
    // stones run along each arm on both shoulders, following its sideways drift as it opens towards the head
    const runs: PaveRun[] = [];
    for (const side of [1, -1])
      for (const dir of [1, -1])
        runs.push(
          paveAlong(
            ringStrand(
              TOP + dir * a0,
              TOP + dir * a1,
              (th) => R + arm(th, side).t,
              (th) => arm(th, side).c,
            ),
            pv,
          ),
        );
    parts = paveParts('split shank', base, pv, runs);
  } else parts = [metal(base, 'split shank')];
  return { parts, seatY: R + tp.tTop * 0.9, topWidth: gap + 2 * hwTop };
}
registerShankBuilder('split', split);

// ---------------------------------------------------------------------------------------------
// Bypass: one band whose two ends sweep past each other at the top, offset along the finger.
// ---------------------------------------------------------------------------------------------
function bypass(ctx: ShankCtx): ShankResult {
  const p = ctx.params;
  const R = ctx.innerRadius;
  const tp = readTaper(p, { w: 2.0, wTop: 2.0, t: 1.7, tTop: 1.9, taperDeg: 70 });
  const outerExp = outerExpFromRoundness(num(p, 'roundness', 0.8, 0, 1));
  const overlap = deg(num(p, 'overlapDeg', 28, 5, 60));
  const gap = num(p, 'gapMm', 0.5, 0, 3);
  const pv = paveOn(ctx) ? paveSpec(ctx, { max: 1.6, rim: 0.12 }) : null;
  if (pv) {
    tp.wBottom = Math.max(tp.wBottom, pv.need);
    tp.wTop = Math.max(tp.wTop, pv.need);
  }
  const off = tp.wTop / 2 + gap / 2;
  const t0 = TOP - overlap;
  const t1 = TOP + TAU + overlap;
  const span = t1 - t0;
  const tipTaper = num(p, 'tipTaper', 0.35, 0, 0.7);
  const noseMm = Math.min(1.2, tp.wTop * 0.6);
  const [a0, a1] = pv ? paveZone(ctx, pv, R + tp.tTop) : [0, 0];
  const zone = pv ? zoneWeight(a0, a1) : () => 0;
  // right hand (default): the end rising from the +X shoulder sits on the +Z side at the top; left hand mirrors it
  const hand = str(p, 'hand', ['right', 'left'] as const, 'right') === 'left' ? -1 : 1;
  const zOf = (th: number) => -hand * off * Math.cos((Math.PI * (th - t0)) / span);
  /** width and thickness of the band at angle th, including the slimming and rounded nose of the ends */
  const sec = (th: number) => {
    const endD = Math.min(th - t0, t1 - th);
    const tipF = 1 - tipTaper * (1 - smooth(endD / (overlap * 1.4)));
    // rounded nose: the last ~1.2 mm closes like a quarter circle instead of ending in a flat cut
    const x = clamp(1 - (endD * R) / noseMm, 0, 1);
    const nose = Math.max(0.12, Math.sqrt(1 - x * x));
    return {
      w: widthAt(tp, th) * tipF * nose,
      t: thickAt(tp, th) * (0.85 + 0.15 * tipF) * (0.35 + 0.65 * nose),
    };
  };
  const g = sweep({
    thetaStart: t0,
    thetaEnd: t1,
    segments: pv ? 280 : 200,
    zOffset: zOf,
    profile: (th) => {
      const { w, t } = sec(th);
      if (pv) return paveSection(pv, R, w, t, outerExp, zone(th));
      return bandSection({ w, t, R, outerExp, innerExp: 3, split: 0.6 });
    },
  });
  let parts: Part[];
  if (pv && a1 > a0) {
    // the strand passes the top twice (once as each end): stones run down both shoulders of both passes,
    // clear of the rounded tips
    const margin = noseMm / R + 0.04;
    const runs: PaveRun[] = [];
    for (const k of [0, TAU])
      for (const dir of [1, -1]) {
        const lo = t0 + margin;
        const hi = t1 - margin;
        const from = clamp(TOP + k + dir * a0, lo, hi);
        const to = clamp(TOP + k + dir * a1, lo, hi);
        if (Math.abs(to - from) * R < pv.pitch) continue;
        runs.push(
          paveAlong(
            ringStrand(from, to, (th) => R + sec(th).t, zOf),
            pv,
          ),
        );
      }
    parts = paveParts('bypass shank', [g], pv, runs);
  } else parts = [metal([g], 'bypass shank')];
  return { parts, seatY: R + tp.tTop, topWidth: 2 * off + tp.wTop };
}
registerShankBuilder('bypass', bypass);

// ---------------------------------------------------------------------------------------------
// Crossover: two slim bands swap sides, crossing at 3 and 9 o'clock; side by side under the head.
// ---------------------------------------------------------------------------------------------
function crossover(ctx: ShankCtx): ShankResult {
  const p = ctx.params;
  const R = ctx.innerRadius;
  const tp = readTaper(p, { w: 1.3, wTop: 1.4, t: 1.6, tTop: 1.7, taperDeg: 70 });
  const outerExp = outerExpFromRoundness(num(p, 'roundness', 0.9, 0, 1));
  const pv = paveOn(ctx) ? paveSpec(ctx, { max: 1.5, rim: 0.12 }) : null;
  let spread = num(p, 'spreadMm', 1.0, 0.3, 3);
  if (pv) {
    tp.wBottom = Math.max(tp.wBottom, pv.need);
    tp.wTop = Math.max(tp.wTop, pv.need);
    spread = Math.max(spread, tp.wTop / 2 + 0.1);
  }
  const lift = 0.85;
  // the strands cross at the sides of the finger: the stones stop short of the crossing
  const [a0, a1] = pv ? paveZone(ctx, pv, R + tp.tTop, Math.PI / 2 - 0.3) : [0, 0];
  const zone = pv ? zoneWeight(a0, a1) : () => 0;
  const bumpAt = (th: number, side: number) => {
    // the strand on top at its crossing is lifted so the two never intersect
    const c = Math.cos(th) * side;
    return Math.max(0, c) ** 2 * thickAt(tp, th) * lift;
  };
  const geos: THREE.BufferGeometry[] = [];
  const runs: PaveRun[] = [];
  for (const side of [1, -1]) {
    geos.push(
      sweep({
        segments: pv ? 280 : 200,
        zOffset: (th) => side * spread * Math.sin(th),
        profile: (th) => {
          const bump = bumpAt(th, side);
          if (pv) return paveSection(pv, R + bump, widthAt(tp, th), thickAt(tp, th), outerExp, zone(th));
          return bandSection({
            w: widthAt(tp, th),
            t: thickAt(tp, th),
            R: R + bump,
            outerExp,
            innerExp: 3,
            split: 0.6,
          });
        },
      }),
    );
    if (pv && a1 > a0)
      for (const dir of [1, -1])
        runs.push(
          paveAlong(
            ringStrand(
              TOP + dir * a0,
              TOP + dir * a1,
              (th) => R + bumpAt(th, side) + thickAt(tp, th),
              (th) => side * spread * Math.sin(th),
            ),
            pv,
          ),
        );
  }
  const parts = pv ? paveParts('crossover shank', geos, pv, runs) : [metal(geos, 'crossover shank')];
  return { parts, seatY: R + tp.tTop, topWidth: 2 * spread + tp.wTop };
}
registerShankBuilder('crossover', crossover);
