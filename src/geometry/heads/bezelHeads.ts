/** Metal-collar heads: full bezel, half bezel, flush (gypsy) and tension jaws. */
import * as THREE from 'three';
import { registerHeadBuilder } from '../builders';
import type { HeadCtx, Part } from '../types';
import {
  baseScaleFor,
  cleanOutline,
  crownInset,
  ensureOutward,
  loft,
  ball,
  loop,
  meanRadius,
  metalPart,
  num,
  pointAt,
  prongSites,
  resample,
  ringDrop,
  stoneSurfaceY,
  support,
  v3,
  wire,
  type CleanOutline,
  type PathPt,
  type SectionPt,
} from './common';

export interface CollarDims {
  o: CleanOutline;
  bs: number;
  pd: number;
  gt: number;
  bd: number;
}

export function collarDims(ctx: HeadCtx, frac = 0.5, footprint = 1): CollarDims {
  const o = cleanOutline(ctx.center.built.outline);
  const bs = num(ctx.params, 'baseScale', 0, 0, 0.95) || baseScaleFor(o, ctx, frac * 0.7);
  const [ax, az] = ctx.bandAxis;
  // a flat-bottomed collar: sink its seat so the outer edge along the band still meets the curved shank
  const reach = Math.max(support(o, ax, az), support(o, -ax, -az)) * Math.max(bs, footprint) + 0.6;
  return {
    o,
    bs,
    pd: Math.max(0.1, ctx.center.built.pavilionDepth),
    gt: Math.max(0, ctx.center.built.girdleThickness),
    bd: ctx.baseDrop + ringDrop(ctx, reach),
  };
}

/** Pavilion cross-section scale at height y (1 at the girdle, 0 at the culet), never below the seat scale. */
export function pavScale(d: CollarDims, y: number): number {
  return Math.max(d.bs, 1 - Math.min(1, Math.max(0, -y - d.gt * 0.5) / d.pd));
}

/** Average inward distance from the girdle edge at which the pavilion has dropped to height y (y below the girdle). */
function pavilionInset(ctx: HeadCtx, o: CleanOutline, y: number): number {
  const stone = ctx.center.built;
  const half = Math.min(support(o, 1, 0), support(o, 0, 1));
  const n = 12;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const p = resampleCache(o)[Math.floor(((i + 0.5) / n) * 48)];
    let lo = 0;
    let hi = half * 0.98;
    for (let k = 0; k < 16; k++) {
      const mid = (lo + hi) / 2;
      const s = stoneSurfaceY(stone, p.x - p.nx * mid, p.z - p.nz * mid, 'bottom');
      if (s !== null && s > y) lo = mid;
      else hi = mid;
    }
    sum += lo;
  }
  return sum / n;
}

const resampled = new WeakMap<CleanOutline, PathPt[]>();
function resampleCache(o: CleanOutline): PathPt[] {
  let r = resampled.get(o);
  if (!r) {
    r = resample(o, 48, 1);
    resampled.set(o, r);
  }
  return r;
}

/** Outline scale that keeps metal at height y outside the real pavilion (never below the linear estimate or the seat). */
export function hugScale(ctx: HeadCtx, d: CollarDims, y: number): number {
  const exact = 1 - pavilionInset(ctx, d.o, y) / Math.max(0.1, meanRadius(d.o));
  return Math.min(1, Math.max(pavScale(d, y), exact, d.bs));
}

/**
 * Bezel cross-section [offset from the girdle outline, y, scale]: a thin collar (bezelThickness, 0.6-0.9 mm) that rises
 * only a little above the girdle, its outer face leaning inward to a rounded polished lip burnished onto the crown.
 * Just under the girdle a small undercut ends the collar, and a thin skirt follows the pavilion down to the seat on the
 * shank, so the setting reads as a slim frame on a tapered cone rather than a deep cup.
 */
/** Height of the collar's lower edge: a basket-carried collar is a little deeper than a skirted one. */
export function collarY(d: CollarDims, open: boolean): number {
  const g2 = d.gt * 0.5;
  return open
    ? -g2 - Math.min(0.3, d.pd * 0.12, Math.max(0.1, d.bd * 0.2))
    : -g2 - Math.min(0.4, d.pd * 0.18, Math.max(0.12, d.bd * 0.25));
}

function bezelSection(ctx: HeadCtx, d: CollarDims, open = false): SectionPt[] {
  const t = num(ctx.params, 'bezelThickness', 0.45, 0.3, 1.5);
  const crown = ctx.center.built.crownHeight;
  const lip = num(ctx.params, 'bezelHeight', Math.min(0.2, crown * 0.2), 0.1, 1.5);
  const g2 = d.gt * 0.5;
  const yTop = g2 + Math.min(lip, Math.max(0.1, crown * 0.2)); // barely above the girdle
  const inset = Math.min(crownInset(ctx.center.built, yTop), 0.25); // the lip overlaps the crown only slightly
  // collar: a thin wall from the lip to just under the girdle
  const yColl = collarY(d, open);
  const skin = Math.max(0.3, t * 0.7); // tulip wall thickness
  const span = d.bd + yColl; // from the collar down to the seat
  const skirt: SectionPt[] = [];
  const k0 = hugScale(ctx, d, yColl);
  for (const f of [0.1, 0.22, 0.36, 0.5, 0.64, 0.78, 0.9]) {
    const y = yColl - span * f;
    // tulip: an S-curve from the collar wall into a slim stem
    const bow = 1 - f * f * (3 - 2 * f);
    const k = Math.max(hugScale(ctx, d, y), d.bs + (k0 - d.bs) * bow);
    skirt.push([skin * (1 - 0.3 * f), y, k]);
  }
  const yCup = -Math.min(d.pd * 0.55, d.bd * 0.7);
  if (open) {
    // a thin collar only: its lower edge follows the pavilion; a wire basket carries it (see basketWires)
    return [
      [-inset, yTop, 1],
      [-inset * 0.5 + 0.02, yTop + 0.04, 1],
      [t * 0.3, yTop + 0.045, 1],
      [t * 0.75, yTop - 0.03, 1],
      [t, yTop - 0.16, 1],
      [t, yColl + 0.1, 1],
      [t * 0.85, yColl - 0.04, 1],
      [t * 0.4, yColl - 0.07, Math.min(1, k0 + 0.02)],
      [0.05, yColl - 0.02, k0],
      [-0.03, -g2 - 0.02, 1],
      [-0.03, g2, 1],
    ];
  }
  return [
    [-inset, yTop, 1],
    [-inset * 0.5 + 0.02, yTop + 0.04, 1],
    [t * 0.3, yTop + 0.045, 1],
    [t * 0.75, yTop - 0.03, 1],
    [t, yTop - 0.16, 1],
    [t, yColl + 0.1, 1],
    [t * 0.9, yColl + 0.02, 1],
    ...skirt,
    [skin * 0.6, -d.bd, d.bs],
    [-t * 0.25, -d.bd, d.bs],
    [0.05, yCup, hugScale(ctx, d, yCup)],
    [-0.3, -g2 - 0.08, 1],
    [-0.03, -g2 - 0.02, 1],
    [-0.03, g2, 1],
  ];
}

/**
 * Four slim wires rise from the shank shoulders, sweep outward in a tulip curve and meet the underside of the collar,
 * leaving open space between them (the stone's pavilion shows through).
 */
function basketWires(ctx: HeadCtx, d: CollarDims): THREE.BufferGeometry[] {
  const t = num(ctx.params, 'bezelThickness', 0.45, 0.3, 1.5);
  const yColl = collarY(d, true);
  const r = Math.max(0.22, t * 0.5);
  const bs = Math.min(d.bs, 0.35);
  const kTop = hugScale(ctx, d, yColl); // under the collar's lower edge, which follows the pavilion
  const drop = (x: number, z: number) => ringDrop(ctx, x * ctx.bandAxis[0] + z * ctx.bandAxis[1]);
  const ySeat = -d.bd + r * 0.9;
  const out: THREE.BufferGeometry[] = [];
  const sites = prongSites(d.o, { count: 4, phase: 0 });
  const ring: THREE.Vector3[] = [];
  for (const s of sites) {
    const p = pointAt(d.o, s);
    const top = v3(p.x * kTop + p.nx * t * 0.35, yColl + 0.12, p.z * kTop + p.nz * t * 0.35);
    const bx = p.x * bs;
    const bz = p.z * bs;
    const seat = v3(bx, ySeat - drop(bx, bz), bz);
    const at = (f: number) => {
      const e = f * f * (3 - 2 * f);
      return v3(top.x + (seat.x - top.x) * e, top.y + (seat.y - top.y) * f, top.z + (seat.z - top.z) * e);
    };
    // no cap on the upper end: it is buried in the collar wall, so nothing shows through the stone
    out.push(...wire([seat, at(0.7), at(0.4), at(0.15), top], r, 18, 8, false), ball(seat, r, 1));
    ring.push(seat);
  }
  out.push(loop(ring, r * 0.95, 48, 8));
  return out;
}

function bezelFull(ctx: HeadCtx): Part[] {
  const d = collarDims(ctx);
  return [
    metalPart(
      [loft(resample(d.o, 120, 1), bezelSection(ctx, d, true), true), ...basketWires(ctx, d)],
      'bezel',
    ),
  ];
}

/** Half bezel: two collar arcs on the sides facing along the band; the other two sides stay open. */
function bezelHalf(ctx: HeadCtx): Part[] {
  const d = collarDims(ctx);
  const path = resample(d.o, 120, 1);
  const cover = Math.cos((num(ctx.params, 'coverAngle', 55, 20, 80) * Math.PI) / 180);
  const [ax, az] = ctx.bandAxis;
  const inSide = path.map((p) => Math.abs(p.nx * ax + p.nz * az) >= cover);
  const runs: PathPt[][] = [];
  const n = path.length;
  // rotate the start to an excluded point so runs do not wrap
  let start = inSide.findIndex((v) => !v);
  if (start < 0) start = 0;
  let cur: PathPt[] = [];
  for (let k = 0; k <= n; k++) {
    const i = (start + k) % n;
    if (k < n && inSide[i]) cur.push(path[i]);
    else {
      if (cur.length >= 2) runs.push(cur);
      cur = [];
    }
  }
  const geos = runs.map((r) => loft(r, bezelSection(ctx, d), false));
  // seat ring joining both halves
  const ring = resample(d.o, 48, 2).map((p) => v3(p.x * d.bs, -d.bd + 0.45, p.z * d.bs));
  geos.push(loop(ring, 0.45, 48, 7));
  return [metalPart(geos, 'half bezel')];
}

/** Flush / gypsy: the stone sinks into a domed collar, only the crown shows. */
function flushGypsy(ctx: HeadCtx): Part[] {
  const d = collarDims(ctx, 0.75, 0.75);
  const w = num(ctx.params, 'domeWidth', 1.4, 0.6, 3);
  const g2 = d.gt * 0.5;
  const top = g2 + num(ctx.params, 'lipHeight', 0.12, 0, 0.6);
  const inset = crownInset(ctx.center.built, top);
  const yCup = -Math.min(d.pd * 0.55, d.bd * 0.7);
  const fall = Math.min(w * 0.8, d.bd * 0.6);
  const section: SectionPt[] = [
    [-inset, top, 1],
    [-inset * 0.4 + 0.03, top + 0.04, 1],
    [w * 0.3, top + 0.03, 1],
    [w * 0.6, top - fall * 0.12, 1],
    [w * 0.85, top - fall * 0.4, 1],
    [w, top - fall, 1],
    [w * 0.95, top - fall - (d.bd + top - fall) * 0.45, Math.max(d.bs, 0.9)],
    [w * 0.7, -d.bd, Math.max(d.bs, 0.75)],
    [-0.3, -d.bd, d.bs],
    [0.05, yCup, pavScale(d, yCup)],
    [-0.3, -g2 - 0.08, 1],
    [-0.03, -g2 - 0.02, 1],
    [-0.03, g2, 1],
  ];
  return [metalPart([loft(resample(d.o, 120, 2), section, true)], 'flush collar')];
}

/**
 * Tension: the shank's two ends rise into rounded jaws along the band axis; a groove in each jaw bites over the girdle.
 * The jaw bottoms follow the curve of the shank so they join it without a gap.
 */
function tension(ctx: HeadCtx): Part[] {
  const o = cleanOutline(ctx.center.built.outline);
  const pd = Math.max(0.1, ctx.center.built.pavilionDepth);
  const g2 = Math.max(0, ctx.center.built.girdleThickness) * 0.5;
  const crown = ctx.center.built.crownHeight;
  const bd = ctx.baseDrop;
  const jaw = num(ctx.params, 'jawThickness', 2.2, 1, 4);
  const bite = num(ctx.params, 'bite', 0.25, 0.05, 0.6);
  const [ax, az] = ctx.bandAxis;
  const px = -az;
  const pz = ax;
  const across = Math.min(support(o, px, pz), support(o, -px, -pz));
  const auto = Math.min(Math.max(ctx.shankWidth * 1.15, 1.6), across * 1.6);
  const jw = num(ctx.params, 'jawWidth', 0, 0, 6) || auto;
  const bev = Math.min(0.15, jw * 0.08);
  const geos: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const a0 = support(o, side * ax, side * az);
    const yTop = g2 + Math.min(0.45, crown * 0.4);
    const yHug = -Math.min(0.6 * bd, pd * 0.8);
    const aHug = a0 * (1 - Math.min(1, -yHug / pd)) + 0.2;
    const R = ctx.innerRadius + 1.8;
    const xMax = Math.sqrt(Math.max(0, R * R - (R - 2.4) ** 2)); // where the shank has fallen 2.4 mm
    const xEnd = Math.min(a0 + jaw + 3, Math.max(xMax, a0 + 1));
    const shankY = (x: number) => -bd - ringDrop(ctx, x);
    const pts: [number, number][] = [];
    const inner = a0 + bev; // the bevel grows the profile by `bev`
    pts.push([inner + 0.1, yTop - bev]);
    pts.push([inner - bite, g2 * 0.2]);
    pts.push([inner + 0.12, -g2 - 0.3]);
    pts.push([Math.max(aHug + bev, inner * 0.4), yHug]);
    const xIn = Math.max(aHug + bev, inner * 0.4) * 0.9;
    // bottom: sink 0.35 mm into the shank all the way out
    for (let k = 0; k <= 8; k++) {
      const x = xIn + ((xEnd - xIn) * k) / 8;
      pts.push([x, shankY(x) + bev - 0.35]);
    }
    // top: from the shank surface at the far end rising smoothly to the jaw top
    for (let k = 1; k <= 10; k++) {
      const f = k / 10;
      const x = xEnd + (inner + 0.6 - xEnd) * f;
      const e = Math.sin((Math.PI / 2) * Math.min(1, f * 1.15)); // rounds over into a flat jaw top
      const y = shankY(x) + (yTop - bev - shankY(x)) * e;
      pts.push([x, Math.max(y, shankY(x) + 0.05 - bev)]);
    }
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const depth = Math.max(0.2, jw - 2 * bev);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: bev,
      bevelSize: bev,
      bevelSegments: 3,
      curveSegments: 4,
    });
    g.translate(0, 0, -depth / 2);
    const X = v3(side * ax, 0, side * az);
    const Y = v3(0, 1, 0);
    const Z = X.clone().cross(Y);
    g.applyMatrix4(new THREE.Matrix4().makeBasis(X, Y, Z));
    geos.push(ensureOutward(g));
  }
  return [metalPart(geos, 'tension jaws')];
}

registerHeadBuilder('bezel-full', bezelFull);
registerHeadBuilder('bezel-half', bezelHalf);
registerHeadBuilder('flush-gypsy', flushGypsy);
registerHeadBuilder('tension', tension);
