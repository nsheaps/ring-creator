/** Metal-collar heads: full bezel, half bezel, flush (gypsy) and tension jaws. */
import * as THREE from 'three';
import { registerHeadBuilder } from '../builders';
import type { HeadCtx, Part } from '../types';
import {
  baseScaleFor,
  cleanOutline,
  ensureOutward,
  loft,
  loop,
  metalPart,
  num,
  resample,
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

function collarDims(ctx: HeadCtx, frac = 0.5): CollarDims {
  const o = cleanOutline(ctx.center.built.outline);
  return {
    o,
    bs: num(ctx.params, 'baseScale', 0, 0, 0.95) || baseScaleFor(o, ctx, frac),
    pd: Math.max(0.1, ctx.center.built.pavilionDepth),
    gt: Math.max(0, ctx.center.built.girdleThickness),
    bd: ctx.baseDrop,
  };
}

/** Bezel cross-section: lip over the crown edge, straight wall, then a skirt tapering to the seat. */
function bezelSection(ctx: HeadCtx, d: CollarDims): SectionPt[] {
  const t = num(ctx.params, 'bezelThickness', 0.7, 0.4, 1.5);
  const lip = num(
    ctx.params,
    'bezelHeight',
    Math.min(0.55, ctx.center.built.crownHeight * 0.5 + 0.15),
    0.15,
    1.5,
  );
  const yCup = -Math.min(d.pd * 0.55, d.bd * 0.7);
  const sCup = Math.max(d.bs, 1 - Math.min(1, -yCup / d.pd));
  return [
    [-0.12, lip, 1],
    [t, lip - 0.08, 1],
    [t, yCup, 1],
    [t * 0.9, -d.bd, d.bs],
    [-t * 0.3, -d.bd, d.bs],
    [-0.05, yCup, sCup],
    [-0.05, -d.gt * 0.5 - 0.05, 1],
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
  const d = collarDims(ctx, 0.75);
  const w = num(ctx.params, 'domeWidth', 1.4, 0.6, 3);
  const top = d.gt * 0.5 + num(ctx.params, 'lipHeight', 0.12, 0, 0.6);
  const yCup = -Math.min(d.pd * 0.55, d.bd * 0.7);
  const sCup = Math.max(d.bs, 1 - Math.min(1, -yCup / d.pd));
  const section: SectionPt[] = [
    [-0.1, top, 1],
    [w * 0.45, top - 0.02, 1],
    [w * 0.85, top - Math.min(w * 0.3, d.bd * 0.3), 1],
    [w, top - Math.min(w * 0.8, d.bd * 0.75), 1],
    [w * 0.6, -d.bd, Math.max(d.bs, 0.75)],
    [-0.3, -d.bd, d.bs],
    [-0.05, yCup, sCup],
    [-0.05, -d.gt * 0.5 - 0.05, 1],
  ];
  return [metalPart([loft(resample(d.o, 120, 2), section, true)], 'flush collar')];
}

/** Tension: two jaw blocks along the band axis that grip the girdle. */
function tension(ctx: HeadCtx): Part[] {
  const o = cleanOutline(ctx.center.built.outline);
  const pd = Math.max(0.1, ctx.center.built.pavilionDepth);
  const gt = Math.max(0, ctx.center.built.girdleThickness);
  const bd = ctx.baseDrop;
  const jaw = num(ctx.params, 'jawThickness', 2.2, 1, 4);
  const bite = num(ctx.params, 'bite', 0.25, 0.05, 0.6);
  const [ax, az] = ctx.bandAxis;
  const minHalf = Math.min(support(o, 1, 0), support(o, 0, 1));
  const jw = num(ctx.params, 'jawWidth', Math.max(ctx.shankWidth, Math.min(3.2, minHalf * 0.9)), 1.5, 6);
  const geos: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const a0 = support(o, side * ax, side * az);
    const yHug = -Math.min(0.6 * bd, pd * 0.9);
    const aHug = Math.min(a0 + 0.15, a0 * (1 - Math.min(1, -yHug / pd)) + 0.25);
    const pts: [number, number][] = [
      [a0 + 0.15, gt * 0.5 + 0.3],
      [a0 - bite, gt * 0.1],
      [a0 + 0.15, -gt * 0.5 - 0.2],
      [aHug, yHug],
      [Math.min(aHug - 0.05, a0 * 0.35), -bd],
      [a0 + jaw + 0.4, -bd],
      [a0 + jaw, gt * 0.5 + 0.15],
    ];
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: jw, bevelEnabled: false, curveSegments: 4 });
    g.translate(0, 0, -jw / 2);
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
