/** Shanks with structure around the head: cathedral arches, split, bypass and crossover. */
import * as THREE from 'three';
import { registerShankBuilder } from '../builders';
import type { ShankCtx, ShankResult } from '../types';
import {
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
  const archStart = deg(num(p, 'archStartDeg', 40, 20, 70));
  const archW =
    num(p, 'archWidthMm', 0, 0, 5) || clamp(Math.min(tp.wTop, (ctx.headHalfAlongFinger || 3) * 0.7), 1.2, 4);
  const archT = num(p, 'archThicknessMm', 1.1, 0.6, 2.5);
  const hx = clamp((ctx.headHalfAlongBand || 3) * 0.72, 1.5, 7);
  const arches: THREE.BufferGeometry[] = [];
  for (const side of [1, -1]) {
    const th0 = TOP - side * archStart;
    const t0 = thickAt(tp, th0);
    const r0 = R + t0 * 0.55;
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
      28,
    );
    const frames = planarFrames(path);
    const wStart = widthAt(tp, th0);
    arches.push(
      finish(
        tube(path, frames, (i) => {
          const f = i / (path.length - 1);
          const w = wStart + (archW - wStart) * smooth(f);
          const t = t0 * 0.8 + (archT - t0 * 0.8) * smooth(f);
          return bandSection({ w, t, R: -t / 2, outerExp: 2.6, innerExp: 2.6, split: 0.5, n: 16 }).map(
            ([u, v]) => [u, v],
          );
        }),
      ),
    );
  }
  return { parts: [metal([band, ...arches], 'cathedral shank')], seatY, topWidth: Math.max(tp.wTop, archW) };
}
registerShankBuilder('cathedral', cathedral);

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
  const gap = num(p, 'gapMm', 0, 0, 5) || autoGap;
  const prong = (w: number) => w * 0.55; // each half band is a bit more than half as wide
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
        segments: 64,
        profile: (th) => {
          const w = widthAt(tp, th);
          const s = smooth(1 - fromTop(th) / splitAng);
          // each arm tapers a little as it climbs towards the head
          const hw = prong(w) * (1 - 0.14 * s);
          const centre = side * ((w - hw) / 2 + s * (gap / 2 + hw / 2 - (w - hw) / 2));
          return bandSection({
            w: hw,
            t: thickAt(tp, th) * (1 - 0.1 * s),
            R,
            outerExp,
            innerExp: 3,
            split: 0.6,
            u0: centre,
          });
        },
      }),
    );
  }
  const hwTop = prong(tp.wTop) * 0.86;
  return {
    parts: [metal([lower, ...halves], 'split shank')],
    seatY: R + tp.tTop * 0.9,
    topWidth: gap + 2 * hwTop,
  };
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
  const off = tp.wTop / 2 + gap / 2;
  const t0 = TOP - overlap;
  const t1 = TOP + TAU + overlap;
  const span = t1 - t0;
  const tipTaper = num(p, 'tipTaper', 0.35, 0, 0.7);
  const g = sweep({
    thetaStart: t0,
    thetaEnd: t1,
    segments: 200,
    zOffset: (th) => -off * Math.cos((Math.PI * (th - t0)) / span),
    profile: (th) => {
      const endD = Math.min(th - t0, t1 - th);
      const tipF = 1 - tipTaper * (1 - smooth(endD / (overlap * 1.4)));
      return bandSection({
        w: widthAt(tp, th) * tipF,
        t: thickAt(tp, th) * (0.85 + 0.15 * tipF),
        R,
        outerExp,
        innerExp: 3,
        split: 0.6,
      });
    },
  });
  return { parts: [metal([g], 'bypass shank')], seatY: R + tp.tTop, topWidth: 2 * off + tp.wTop };
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
  const spread = num(p, 'spreadMm', 1.0, 0.3, 3);
  const lift = 0.85;
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [1, -1]) {
    parts.push(
      sweep({
        segments: 200,
        zOffset: (th) => side * spread * Math.sin(th),
        profile: (th) => {
          // the strand on top at its crossing is lifted so the two never intersect
          const c = Math.cos(th) * side;
          const bump = Math.max(0, c) ** 2 * thickAt(tp, th) * lift;
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
  }
  return { parts: [metal(parts, 'crossover shank')], seatY: R + tp.tTop, topWidth: 2 * spread + tp.wTop };
}
registerShankBuilder('crossover', crossover);
