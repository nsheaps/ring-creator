/** Prong-family heads: solitaires, basket, cathedral, v-prong, trellis, split, double claw, compass, vintage filigree. */
import * as THREE from 'three';
import { registerHeadBuilder } from '../builders';
import type { HeadCtx, Part } from '../types';
import {
  PRONG_STYLES,
  ball,
  baseScaleFor,
  bool,
  cleanOutline,
  loop,
  metalPart,
  num,
  pointAt,
  prongSet,
  prongSites,
  resample,
  str,
  support,
  v3,
  wire,
  type ProngSetOpts,
  type ProngStyle,
} from './common';

export interface ProngDefaults {
  count: number;
  style: ProngStyle;
  rails: number;
  phase?: number;
  useCorners?: boolean;
  double?: boolean;
  split?: boolean;
  trellis?: boolean;
  baseFrac?: number;
}

/** Resolve the common prong params (prongCount, prongStyle, prongWidth, galleryRails, baseScale) with defaults. */
export function prongOpts(ctx: HeadCtx, d: ProngDefaults): ProngSetOpts {
  const o = cleanOutline(ctx.center.built.outline);
  const p = ctx.params;
  const railsN = Math.round(num(p, 'galleryRails', d.rails, 0, 3));
  const rails = railsN === 0 ? [] : railsN === 1 ? [0.45] : railsN === 2 ? [0.3, 0.68] : [0.25, 0.5, 0.75];
  return {
    count: Math.round(num(p, 'prongCount', d.count, 2, 12)),
    style: str(p, 'prongStyle', PRONG_STYLES, d.style),
    wireMm: num(p, 'prongWidth', 0.9, 0.5, 1.6),
    baseY: -ctx.baseDrop,
    baseScale: num(p, 'baseScale', 0, 0, 0.95) || baseScaleFor(o, ctx, d.baseFrac ?? 0.45),
    phase: d.phase,
    useCorners: d.useCorners,
    rails,
    double: d.double,
    split: d.split,
    trellis: d.trellis,
  };
}

/** Plain prong head around the centre stone. */
export function prongHead(ctx: HeadCtx, d: ProngDefaults, extra: THREE.BufferGeometry[] = []): Part[] {
  const geos = prongSet(ctx.center.built, prongOpts(ctx, d));
  return [metalPart([...geos, ...extra], 'prong head')];
}

/** Two cathedral arches rising from the shank along the band axis up to the lower gallery. */
function cathedralArches(ctx: HeadCtx, opts: ProngSetOpts, wireMm: number): THREE.BufferGeometry[] {
  const o = cleanOutline(ctx.center.built.outline);
  const [ax, az] = ctx.bandAxis;
  const px = -az;
  const pz = ax; // across the band
  const r = wireMm / 2;
  const pd = ctx.center.built.pavilionDepth;
  const yTop = -Math.min(0.3 * pd, ctx.baseDrop * 0.5);
  const s = Math.max(opts.baseScale, 1 - Math.min(1, -yTop / pd));
  const out: THREE.BufferGeometry[] = [];
  const reach = support(o, ax, az);
  const acrossHalf = Math.max(support(o, px, pz) * 0.55, ctx.shankWidth * 0.5);
  for (const side of [-1, 1]) {
    for (const lat of [-1, 1]) {
      const foot = v3(side * ax * (reach * 0.95 + 1.2) + lat * px * ctx.shankWidth * 0.32, -ctx.baseDrop - 0.25, side * az * (reach * 0.95 + 1.2) + lat * pz * ctx.shankWidth * 0.32);
      const mid = v3(side * ax * reach * 0.8 + lat * px * acrossHalf * 0.8, (yTop - ctx.baseDrop) * 0.45, side * az * reach * 0.8 + lat * pz * acrossHalf * 0.8);
      const top = v3(lat * px * acrossHalf * s + side * ax * reach * s * 0.4, yTop, lat * pz * acrossHalf * s + side * az * reach * s * 0.4);
      out.push(...wire([foot, mid, top], r, 18, 8));
    }
  }
  return out;
}

/** Filigree scrolls: little loops on the gallery between prongs, plus milgrain beads on the upper rail. */
function filigree(ctx: HeadCtx, opts: ProngSetOpts, wireMm: number): THREE.BufferGeometry[] {
  const o = cleanOutline(ctx.center.built.outline);
  const pd = Math.max(0.1, ctx.center.built.pavilionDepth);
  const r = wireMm / 2;
  const out: THREE.BufferGeometry[] = [];
  const sites = prongSites(o, { count: opts.count, phase: opts.phase, useCorners: opts.useCorners });
  const yMid = -Math.min(0.5 * pd, ctx.baseDrop * 0.55);
  const s = Math.max(opts.baseScale, 1 - Math.min(1, -yMid / pd));
  const P = o.perimeter;
  const sorted = sites.slice().sort((a, b) => a - b);
  sorted.forEach((a, i) => {
    const b = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + P;
    const m = pointAt(o, (a + b) / 2);
    const c = v3(m.x * s + m.nx * (r * 1.4), yMid, m.z * s + m.nz * (r * 1.4));
    const rad = Math.min(0.9, Math.max(0.35, ((b - a) * s) / 6), Math.max(0.3, ctx.baseDrop * 0.3));
    // scroll: two small rings side by side (a heart-like double loop)
    for (const k of [-1, 1]) {
      const t = v3(m.tx, 0, m.tz).multiplyScalar(k * rad * 0.9);
      const ring = new THREE.TorusGeometry(rad, r * 0.45, 6, 18);
      const basis = new THREE.Matrix4().makeBasis(v3(m.tx, 0, m.tz), v3(0, 1, 0), v3(m.nx, 0, m.nz));
      ring.applyMatrix4(basis);
      ring.translate(c.x + t.x, c.y, c.z + t.z);
      out.push(ring.toNonIndexed());
    }
  });
  // milgrain beads on a fine upper rail
  const yRail = -Math.min(0.18 * pd + r, ctx.baseDrop * 0.3);
  const sr = Math.max(opts.baseScale, 1 - Math.min(1, -yRail / pd));
  const path = resample(o, 64, 2);
  const railPts = path.map((p) => v3(p.x * sr + p.nx * r * 1.1, yRail, p.z * sr + p.nz * r * 1.1));
  out.push(loop(railPts, r * 0.55, 72, 6));
  const beads = Math.max(16, Math.min(90, Math.floor((o.perimeter * sr) / 0.45)));
  for (let i = 0; i < beads; i++) {
    const p = pointAt(o, (i / beads) * o.perimeter);
    out.push(ball(v3(p.x * sr + p.nx * r * 1.75, yRail, p.z * sr + p.nz * r * 1.75), r * 0.4, 0));
  }
  return out;
}

const builders: Record<string, (ctx: HeadCtx) => Part[]> = {
  'solitaire-4-prong': (ctx) => prongHead(ctx, { count: 4, style: 'round', rails: 1 }),
  'solitaire-6-prong': (ctx) => prongHead(ctx, { count: 6, style: 'claw', rails: 1, baseFrac: 0.4 }),
  '3-prong': (ctx) => prongHead(ctx, { count: 3, style: 'round', rails: 1, phase: 0 }),
  'double-claw': (ctx) => prongHead(ctx, { count: 4, style: 'claw', rails: 1, double: true }),
  basket: (ctx) => prongHead(ctx, { count: 4, style: 'round', rails: 2 }),
  'cathedral-head': (ctx) => {
    const opts = prongOpts(ctx, { count: 4, style: 'round', rails: 1 });
    return [metalPart([...prongSet(ctx.center.built, opts), ...cathedralArches(ctx, opts, num(ctx.params, 'archWidth', 1.1, 0.6, 2))], 'cathedral head')];
  },
  'v-prong': (ctx) => prongHead(ctx, { count: 4, style: 'v', rails: 1 }),
  trellis: (ctx) => prongHead(ctx, { count: 4, style: 'round', rails: 0, trellis: true }),
  'split-prong': (ctx) => prongHead(ctx, { count: 4, style: 'round', rails: 1, split: true }),
  compass: (ctx) =>
    prongHead(ctx, { count: 4, style: 'claw', rails: 1, phase: 0, useCorners: bool(ctx.params, 'useCorners', false) }),
  'vintage-filigree': (ctx) => {
    const opts = prongOpts(ctx, { count: 6, style: 'round', rails: 1 });
    return [metalPart([...prongSet(ctx.center.built, opts), ...filigree(ctx, opts, opts.wireMm)], 'filigree head')];
  },
};

for (const [key, fn] of Object.entries(builders)) registerHeadBuilder(key, fn);
