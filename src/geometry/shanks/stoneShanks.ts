/** Shanks that carry accent stones: pave (beads) and channel (stones in a groove). */
import * as THREE from 'three';
import { registerShankBuilder } from '../builders';
import type { Part, ShankCtx, ShankResult } from '../types';
import { toFlat, type ProfilePoint } from '../helpers';
import {
  TOP,
  accentDims,
  accentSize,
  bandSection,
  beadGeometry,
  clamp,
  fromTop,
  headHalfAngle,
  instances,
  metal,
  num,
  outerExpFromRoundness,
  readTaper,
  ringFrame,
  smooth,
  spacedAngles,
  sweep,
  thickAt,
  widthAt,
} from './common';

/** Stone angles on both shoulders: from the edge of the head down to `coverage` of the half circumference. */
function stoneAngles(a0: number, a1: number, r: number, pitch: number): number[] {
  const one = spacedAngles(a0, a1, r, pitch);
  return [...one.map((a) => TOP - a), ...one.map((a) => TOP + a)];
}

/**
 * Pave section: a two-half superellipse band with a bright-cut trough of half width g, bevel b and depth d cut into
 * the top. Key points are doubled so the bevels keep crisp edges while the rest of the band stays smooth.
 */
export function troughSection(
  R: number,
  w: number,
  t: number,
  outerExp: number,
  innerExp: number,
  trough: { g: number; b: number; d: number },
): ProfilePoint[] {
  const split = 0.55;
  const hTop = t * split;
  const hBot = t - hTop;
  const rMid = R + hBot;
  const hw = w / 2;
  const nIn = 12;
  const out: ProfilePoint[] = [];
  // inner (finger side) half, left -> right
  for (let i = 0; i <= nIn; i++) {
    const a = Math.PI + (i / nIn) * Math.PI;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    out.push([
      hw * Math.sign(c) * Math.abs(c) ** (2 / innerExp),
      rMid + hBot * Math.sign(sn) * Math.abs(sn) ** (2 / innerExp),
    ]);
  }
  out.push(out[out.length - 1]); // crease at the side
  const g = Math.min(trough.g, hw - 0.3);
  const b = Math.max(0.02, Math.min(trough.b, hw - g - 0.15));
  const top = (u: number) => rMid + hTop * Math.max(0, 1 - Math.abs(u / hw) ** outerExp) ** (1 / outerExp);
  const cut = (u: number) => {
    const x = Math.abs(u);
    if (x <= g) return trough.d;
    if (x >= g + b) return 0;
    return trough.d * (1 - (x - g) / b);
  };
  const sideK = 5;
  const us: number[] = [];
  for (let i = 1; i <= sideK; i++) us.push(hw - ((hw - g - b) * i) / sideK); // hw .. g+b
  const right = [...us, g + b, g, g, 0];
  const pts: number[] = [
    ...right,
    ...right
      .slice(0, -1)
      .reverse()
      .map((u) => -u),
  ];
  // pts runs right -> left: hw-.. , g+b, g+b, g, g, 0, -g, -g, -(g+b), -(g+b), .. -hw
  pts.forEach((u) => out.push([u, top(u) - cut(u)]));
  out.push([-hw, rMid]);
  return out;
}

/** Minimum radial thickness (mm) of a micro-pave band. */
export const MICRO_PAVE_MIN_T = 2.0;

/** Upper (outer) half of a two-half superellipse section as a dense polyline from the left edge over the top to the right edge. */
function outerArc(hw: number, hTop: number, e: number, n = 120): { u: number; v: number; s: number }[] {
  const pts: { u: number; v: number; s: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI - (i / n) * Math.PI;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const u = hw * Math.sign(c) * Math.abs(c) ** (2 / e);
    const v = hTop * Math.abs(sn) ** (2 / e);
    const prev = pts[i - 1];
    pts.push({ u, v, s: prev ? prev.s + Math.hypot(u - prev.u, v - prev.v) : 0 });
  }
  return pts;
}

/**
 * Micro-pave: the whole upper surface of a rounded band is covered with `rows` staggered rows of tiny stones spread over the
 * whole dome, over the top and down both faces, nearly touching, all the way round (coverage 1) or from the head
 * to `coverage` of each half. There is no trough; the metal is a smooth dome the stones are sunk into.
 */
function microPave(ctx: ShankCtx, rows: number): ShankResult {
  const p = ctx.params;
  const R = ctx.innerRadius;
  const tp = readTaper(p, { w: 3.2, wTop: 3.4, t: 2.0, tTop: 2.1, taperDeg: 60 });
  // stones are seated all over the dome, pavilions pointing into the metal: a micro-pave band is never thinner than
  // about 2 mm radially, or the seats would break through the finger side
  tp.tBottom = Math.max(tp.tBottom, MICRO_PAVE_MIN_T);
  tp.tTop = Math.max(tp.tTop, tp.tBottom);
  const outerExp = outerExpFromRoundness(num(p, 'roundness', 0.85, 0, 1));
  const coverage = num(p, 'coverage', 1, 0.1, 1);
  const size = accentSize(ctx, p, 0.8, 1.6);
  const dims = accentDims(ctx, size);
  const built = ctx.stone(ctx.accent.cut.id, dims, { detail: 'low' });
  const gap = num(p, 'stoneGapMm', 0.03, 0, 0.4);
  const ch = built.crownHeight;
  const split = 0.76;
  const across = dims.width * 0.9 + gap;
  const need = (rows - 1) * across + dims.width + 0.5;
  // widen the band until the dome's upper arc is long enough for every row
  const arcLen = (w: number, t: number) => {
    const a = outerArc(w / 2, t * split, outerExp, 60);
    return a[a.length - 1].s;
  };
  for (let k = 0; k < 8 && arcLen(tp.wTop, tp.tTop) < need; k++) {
    tp.wTop *= 1.06;
    tp.wBottom *= 1.06;
    tp.tTop *= 1.02;
    tp.tBottom *= 1.02;
  }
  const rOut = R + tp.tBottom;
  const a0 = headHalfAngle(ctx, rOut) + 0.02;
  const a1 = Math.max(a0 + 0.05, coverage * Math.PI);
  const band = sweep({
    segments: 200,
    smoothProfile: true,
    profile: (th) =>
      bandSection({
        w: widthAt(tp, th),
        t: thickAt(tp, th),
        R,
        outerExp,
        innerExp: 2.6,
        split,
        n: 32,
      }),
  });
  const pitch = dims.length + gap;
  const nAlong = Math.max(0, Math.floor(((a1 - a0) * rOut) / pitch));
  /**
   * Frame on the dome at angle th, at `frac` (-1 .. 1) of the usable arc across the section, sunk `sink` below the
   * surface along its outward normal (dsMm moves it further across, in mm of arc): X along the band, Y out of the metal (a stone's table), Z across.
   */
  const onDome = (th: number, frac: number, sink: number, dsMm = 0): THREE.Matrix4 => {
    const w = widthAt(tp, th);
    const t = thickAt(tp, th);
    const arc = outerArc(w / 2, t * split, outerExp);
    const total = arc[arc.length - 1].s;
    const lim = Math.max(0, total / 2 - dims.width * 0.5 - 0.12);
    const target = clamp(total / 2 + frac * lim + dsMm, 0, total);
    let j = 1;
    while (j < arc.length - 1 && arc[j].s < target) j++;
    const A = arc[j - 1];
    const B = arc[j];
    const k = (target - A.s) / Math.max(1e-6, B.s - A.s);
    const u = A.u + (B.u - A.u) * k;
    const v = A.v + (B.v - A.v) * k;
    const len = Math.hypot(B.u - A.u, B.v - A.v) || 1;
    // outward normal of the section (u right, v up); the polyline runs left to right over the top, so the
    // outward side is to its left: (-dv, du)
    const nu = -(B.v - A.v) / len;
    const nv = (B.u - A.u) / len;
    const rMid = R + t - t * split;
    const rr = rMid + v - nv * sink;
    const uu = u - nu * sink;
    const c = Math.cos(th);
    const sn = Math.sin(th);
    const X = new THREE.Vector3(-sn, c, 0);
    const Y = new THREE.Vector3(c * nv, sn * nv, nu).normalize();
    const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
    const m = new THREE.Matrix4().makeBasis(X, Y, Z);
    m.setPosition(rr * c, rr * sn, uu);
    return m;
  };
  const rowFrac = (row: number) => (rows > 1 ? (row - (rows - 1) / 2) / ((rows - 1) / 2) : 0);
  const rowShift = (row: number) => (row % 2 ? 0.5 : 0);
  const angleAt = (side: number, along: number) => TOP + side * (a0 + (along * pitch) / rOut);
  // stones sit flush in their bored seats: the girdle just below the metal surface, the shallow crown above it
  const stoneSink = ch * 0.25;
  const stoneMs: THREE.Matrix4[] = [];
  for (let row = 0; row < rows; row++)
    for (const side of [-1, 1])
      for (let i = 0; i < nAlong; i++)
        stoneMs.push(onDome(angleAt(side, i + 0.5 + rowShift(row)), rowFrac(row), stoneSink));
  // Holding beads: one in every three-stone interstice of the staggered grid (between rows r and r+1 the triangles
  // alternate, their centroids a third and two thirds of the way across, half a pitch apart along the band), plus a
  // bead between neighbours on the two outer rows' outer edges. They are raised from the metal and overlap the girdles.
  const beadR = clamp(dims.width * 0.15, 0.1, 0.24);
  const beadSink = beadR * 0.45;
  const beadMs: THREE.Matrix4[] = [];
  if (nAlong > 0) {
    for (const side of [-1, 1]) {
      for (let row = 0; row < rows - 1; row++) {
        const f0 = rowFrac(row);
        const f1 = rowFrac(row + 1);
        for (let i = 0; i < nAlong - 1; i++) {
          const sA = i + 1 + rowShift(row); // between stones i and i+1 of row r, under a stone of row r+1
          const sB = i + 1 + rowShift(row + 1); // between stones of row r+1, over a stone of row r
          beadMs.push(onDome(angleAt(side, sA), f0 + (f1 - f0) / 3, beadSink));
          beadMs.push(onDome(angleAt(side, sB), f0 + ((f1 - f0) * 2) / 3, beadSink));
        }
      }
      for (const [row, dir] of [
        [0, -1],
        [rows - 1, 1],
      ] as const)
        for (let i = 0; i <= nAlong; i++)
          beadMs.push(
            onDome(angleAt(side, i + rowShift(row)), rowFrac(row), beadSink, dir * dims.width * 0.42),
          );
    }
  }
  const geos = [band];
  // a low dome is enough: the lower half of every bead is inside the metal (and hundreds of them must fit the budget)
  const dome = toFlat(new THREE.SphereGeometry(beadR, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2));
  if (beadMs.length) geos.push(instances(dome, beadMs));
  const parts: Part[] = [metal(geos, 'micro-pave shank')];
  if (stoneMs.length)
    parts.push({
      slot: 'accent-stone',
      geometry: instances(built.geometry, stoneMs),
      label: 'micro-pave stones',
    });
  return { parts, seatY: R + tp.tTop, topWidth: tp.wTop };
}

function pave(ctx: ShankCtx): ShankResult {
  const p = ctx.params;
  const R = ctx.innerRadius;
  const rowCount = Math.round(num(p, 'rows', 1, 1, 8));
  if (rowCount >= 2) return microPave(ctx, rowCount);
  const tp = readTaper(p, { w: 2.2, wTop: 2.4, t: 1.8, tTop: 1.9, taperDeg: 60 });
  const outerExp = outerExpFromRoundness(num(p, 'roundness', 0.3, 0, 1));
  const coverage = num(p, 'coverage', 0.5, 0.1, 1);
  const size = accentSize(ctx, p, 0.8, 2.6);
  const dims = accentDims(ctx, size);
  const built = ctx.stone(ctx.accent.cut.id, dims, { detail: 'low' });
  const gapMm = num(p, 'stoneGapMm', 0.08, 0, 0.6);
  const ch = built.crownHeight;
  // bright-cut trough: stones sit in it with the girdle just below the surface and the table proud of it
  const g = dims.width / 2 + 0.03;
  const bevel = clamp(dims.width * 0.22, 0.18, 0.35);
  const d = ch * 0.65 + 0.06;
  // the shank widens so a polished rim stays either side of the bright cut
  const need = 2 * (g + bevel + 0.18);
  tp.wBottom = Math.max(tp.wBottom, need);
  tp.wTop = Math.max(tp.wTop, need);
  const rOut = R + tp.tBottom;
  const a0 = headHalfAngle(ctx, rOut) + 0.02;
  const a1 = Math.max(a0, coverage * Math.PI);
  const pitch = dims.length + gapMm;
  const count = Math.max(0, Math.floor(((a1 - a0) * rOut) / pitch));
  const one = Array.from({ length: count }, (_, i) => a0 + ((i + 0.5) * pitch) / rOut);
  const angles = [...one.map((a) => TOP - a), ...one.map((a) => TOP + a)];
  const zoneEnd = count > 0 ? one[count - 1] + (pitch * 0.5 + 0.1) / rOut : a0;
  const fade = 0.06;
  const troughAt = (th: number) => {
    if (count === 0) return 0;
    const dd = fromTop(th);
    return smooth((dd - (a0 - 0.08)) / fade) * smooth((zoneEnd - dd) / fade);
  };
  const band = sweep({
    segments: 240,
    smoothProfile: true,
    profile: (th) =>
      troughSection(R, widthAt(tp, th), thickAt(tp, th), outerExp, 3, {
        g,
        b: bevel,
        d: d * troughAt(th),
      }),
  });
  const stoneMs: THREE.Matrix4[] = [];
  const beadMs: THREE.Matrix4[] = [];
  const beadR = clamp(dims.width * 0.2, 0.15, 0.32);
  const beadU = (dims.width / 2) * 0.78;
  for (const th of angles) {
    const t = thickAt(tp, th);
    const rg = R + t - ch * 0.7;
    stoneMs.push(ringFrame(th, rg, 0));
  }
  // beads are shared: one pair in every gap between neighbouring stones, plus one pair closing each end of the row
  for (const side of [-1, 1])
    for (let i = 0; i <= count; i++) {
      const a = TOP + side * (a0 + (i * pitch) / rOut);
      const t = thickAt(tp, a);
      for (const u of [-beadU, beadU]) beadMs.push(ringFrame(a, R + t - ch * 0.7 + ch * 0.35, u));
    }
  const geos = [band];
  if (count > 0) geos.push(instances(beadGeometry(beadR, 8, 6), beadMs));
  const parts: Part[] = [metal(geos, 'pave shank')];
  if (stoneMs.length)
    parts.push({ slot: 'accent-stone', geometry: instances(built.geometry, stoneMs), label: 'pave stones' });
  return { parts, seatY: R + tp.tTop, topWidth: tp.wTop };
}
registerShankBuilder('pave', pave);

/** Channel section: a flat-topped band with a groove of half-width gw and depth gd cut into the top. */
function channelSection(R: number, w: number, t: number, gw: number, gd: number): ProfilePoint[] {
  const hw = w / 2;
  const c = Math.min(0.25, t * 0.15, hw * 0.2);
  const top = R + t;
  const g = Math.min(gw, hw - 0.35);
  // bright-cut chamfer on the inside edge of each wall (fades out with the groove)
  const e = Math.min(0.12, gd * 0.5, (hw - g) * 0.4);
  return [
    [-hw + c, R],
    [hw - c, R],
    [hw, R + c],
    [hw, top - c],
    [hw - c, top],
    [g + e, top],
    [g, top - e],
    [g, top - gd],
    [-g, top - gd],
    [-g, top - e],
    [-g - e, top],
    [-hw + c, top],
    [-hw, top - c],
    [-hw, R + c],
  ];
}

function channel(ctx: ShankCtx): ShankResult {
  const p = ctx.params;
  const R = ctx.innerRadius;
  const coverage = num(p, 'coverage', 0.5, 0.1, 1);
  const size0 = accentSize(ctx, p, 0.8, 3);
  const dims = accentDims(ctx, size0);
  const built = ctx.stone(ctx.accent.cut.id, dims, { detail: 'low' });
  const wallMm = num(p, 'wallMm', 0.45, 0.3, 1);
  const minWidth = dims.width + 2 * wallMm;
  const tp = readTaper(p, { w: 2.4, wTop: 2.6, t: 1.9, tTop: 2.0, taperDeg: 60 });
  tp.wBottom = Math.max(tp.wBottom, minWidth);
  tp.wTop = Math.max(tp.wTop, minWidth);
  const rOut = R + tp.tBottom;
  const hA = headHalfAngle(ctx, rOut);
  const zoneEnd = Math.max(hA + 0.1, coverage * Math.PI);
  const fade = 0.1;
  const gw = dims.width / 2 + 0.03;
  const depthFull = (t: number) => Math.min(built.crownHeight + 0.35, t - 0.6);
  const grooveAt = (th: number) => {
    const d = fromTop(th);
    return smooth((d - hA * 0.6) / fade) * smooth((zoneEnd - d) / fade);
  };
  const band = sweep({
    segments: 220,
    smoothProfile: false,
    profile: (th) => {
      const t = thickAt(tp, th);
      return channelSection(R, widthAt(tp, th), t, gw, Math.max(0, depthFull(t) * grooveAt(th)));
    },
  });
  const pitch = dims.length + num(p, 'stoneGapMm', 0.04, 0, 0.6);
  const angles = stoneAngles(hA + 0.02, zoneEnd - fade, rOut, pitch);
  const ms = angles.map((th) => ringFrame(th, R + thickAt(tp, th) - built.crownHeight - 0.04, 0));
  const parts: Part[] = [metal([band], 'channel shank')];
  if (ms.length)
    parts.push({ slot: 'accent-stone', geometry: instances(built.geometry, ms), label: 'channel stones' });
  return { parts, seatY: R + tp.tTop, topWidth: tp.wTop };
}
registerShankBuilder('channel', channel);
