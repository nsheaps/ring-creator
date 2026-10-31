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
  loop,
  metalPart,
  num,
  resample,
  ringDrop,
  support,
  v3,
  type CleanOutline,
  type PathPt,
  type SectionPt,
} from './common';

interface CollarDims {
  o: CleanOutline;
  bs: number;
  pd: number;
  gt: number;
  bd: number;
}

function collarDims(ctx: HeadCtx, frac = 0.5, footprint = 1): CollarDims {
  const o = cleanOutline(ctx.center.built.outline);
  const bs = num(ctx.params, 'baseScale', 0, 0, 0.95) || baseScaleFor(o, ctx, frac);
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
function pavScale(d: CollarDims, y: number): number {
  return Math.max(d.bs, 1 - Math.min(1, Math.max(0, -y - d.gt * 0.5) / d.pd));
}

/**
 * Bezel cross-section [offset from the girdle outline, y, scale]: the inner face hugs the girdle and is burnished over the
 * crown edge up to the lip height; the outer wall drops straight past the girdle, then curves in to the seat on the shank.
 */
function bezelSection(ctx: HeadCtx, d: CollarDims): SectionPt[] {
  const t = num(ctx.params, 'bezelThickness', 0.6, 0.4, 1.5);
  const crown = ctx.center.built.crownHeight;
  const lip = num(ctx.params, 'bezelHeight', Math.min(0.45, crown * 0.45), 0.15, 1.5);
  const g2 = d.gt * 0.5;
  const yTop = g2 + Math.min(lip, Math.max(0.1, crown * 0.8));
  const inset = crownInset(ctx.center.built, yTop);
  const yWall = -Math.min(0.7, d.pd * 0.3, d.bd * 0.35);
  const span = d.bd + yWall; // from the bottom of the wall down to the seat
  const yCup = -Math.min(d.pd * 0.55, d.bd * 0.7);
  const outerAt = (f: number): SectionPt => {
    // convex taper from the wall (f = 0) to the seat (f = 1)
    const k = 1 - (1 - d.bs) * f * f;
    return [t * (1 - 0.15 * f), yWall - span * f, k];
  };
  return [
    [-inset, yTop, 1],
    [-inset * 0.45 + 0.04, yTop + 0.07, 1],
    [t * 0.5, yTop + 0.06, 1],
    [t * 0.88, yTop - 0.06, 1],
    [t, yTop - 0.22, 1],
    [t, yWall, 1],
    outerAt(0.3),
    outerAt(0.55),
    outerAt(0.8),
    outerAt(1),
    [-t * 0.25, -d.bd, d.bs],
    [0.05, yCup, pavScale(d, yCup)],
    [-0.3, -g2 - 0.08, 1],
    [-0.03, -g2 - 0.02, 1],
    [-0.03, g2, 1],
  ];
}

function bezelFull(ctx: HeadCtx): Part[] {
  const d = collarDims(ctx);
  return [metalPart([loft(resample(d.o, 120, 1), bezelSection(ctx, d), true)], 'bezel')];
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
