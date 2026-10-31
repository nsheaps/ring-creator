/** Halo-family heads: halo (round / cushion / oval / follow), hidden halo, double halo and cluster. */
import * as THREE from 'three';
import { registerHeadBuilder } from '../builders';
import type { HeadCtx, Part } from '../types';
import {
  accentDims,
  accentPart,
  accentRing,
  cleanOutline,
  loop,
  metalPart,
  num,
  offsetOutline,
  pointAt,
  prongSet,
  scaleOutline,
  str,
  support,
  templateOutline,
  v3,
  wire,
  type CleanOutline,
} from './common';
import { prongOpts } from './prongHeads';

const HALO_SHAPES = ['follow', 'round', 'cushion', 'oval'] as const;
type HaloShape = (typeof HALO_SHAPES)[number];

function meleeSize(ctx: HeadCtx): number {
  const override = num(ctx.params, 'meleeSize', 0, 0, 4);
  return Math.min(3, Math.max(0.7, override > 0 ? override : ctx.accent.sizeMm || 1.2));
}

function haloPath(o: CleanOutline, shape: HaloShape, offset: number): CleanOutline {
  return shape === 'follow' ? offsetOutline(o, offset) : templateOutline(o, shape, offset, 1.25);
}

/** Struts from a halo frame down to the seat ring so the halo is carried by the head. */
function struts(
  ctx: HeadCtx,
  path: CleanOutline,
  yTop: number,
  bs: number,
  wireMm: number,
): THREE.BufferGeometry[] {
  const o = cleanOutline(ctx.center.built.outline);
  const out: THREE.BufferGeometry[] = [];
  const r = wireMm * 0.45;
  for (const ang of [0.125, 0.375, 0.625, 0.875]) {
    const a = Math.PI * 2 * ang;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const rh = hit(path, dx, dz);
    const rb = hit(o, dx, dz) * bs;
    const top = v3(dx * (rh - 0.2), yTop, dz * (rh - 0.2));
    const bot = v3(dx * rb, -ctx.baseDrop + r, dz * rb);
    const mid = v3(dx * (rh * 0.55 + rb * 0.45), (yTop - ctx.baseDrop) * 0.55, dz * (rh * 0.55 + rb * 0.45));
    out.push(...wire([top, mid, bot], r, 14, 7));
  }
  return out;
}

function hit(o: CleanOutline, dx: number, dz: number): number {
  // radial distance of the outline in direction (dx, dz): support of the nearest points is good enough for convex-ish paths
  let best = 0;
  let bestDot = -Infinity;
  for (const p of o.pts) {
    const r = Math.hypot(p[0], p[1]);
    if (r < 1e-6) continue;
    const d = (p[0] * dx + p[1] * dz) / r;
    if (d > bestDot) {
      bestDot = d;
      best = r;
    }
  }
  return best || support(o, dx, dz);
}

interface HaloRingSpec {
  offset: number;
  y: number;
}

function haloHead(ctx: HeadCtx, defShape: HaloShape, rings: HaloRingSpec[] | null): Part[] {
  const o = cleanOutline(ctx.center.built.outline);
  const s = meleeSize(ctx);
  const w = accentDims(ctx, s).width;
  const gap = num(ctx.params, 'haloGap', 0.25, 0, 1.5);
  const spacing = num(ctx.params, 'meleeSpacing', 0.12, 0, 0.8);
  const drop = num(ctx.params, 'haloDrop', 0.3, 0, 1.5);
  const shape = str(ctx.params, 'haloShape', HALO_SHAPES, defShape);
  const opts = prongOpts(ctx, { count: 4, style: 'round', rails: 0 });
  const metal: THREE.BufferGeometry[] = [...prongSet(ctx.center.built, { ...opts, rails: [] })];
  const stones: THREE.BufferGeometry[] = [];
  const specs = rings ?? [{ offset: gap + w / 2 + 0.2, y: -drop }];
  let outerPath: CleanOutline | null = null;
  let outerY = 0;
  for (const spec of specs) {
    const path = haloPath(o, shape, spec.offset);
    const r = accentRing(ctx, { path, size: s, y: spec.y, spacing, minCount: 10 });
    stones.push(r.stones);
    metal.push(...r.metal);
    outerPath = path;
    outerY = spec.y;
  }
  if (outerPath) metal.push(...struts(ctx, outerPath, outerY - 0.6, opts.baseScale, opts.wireMm));
  return [metalPart(metal, 'halo head'), accentPart(stones, 'halo melee')];
}

function doubleHalo(ctx: HeadCtx): Part[] {
  const s = meleeSize(ctx);
  const w = accentDims(ctx, s).width;
  const gap = num(ctx.params, 'haloGap', 0.25, 0, 1.5);
  const drop = num(ctx.params, 'haloDrop', 0.3, 0, 1.5);
  const ringGap = num(ctx.params, 'ringGap', 0.45, 0.2, 1.5);
  const inner = gap + w / 2 + 0.2;
  return haloHead(ctx, 'follow', [
    { offset: inner, y: -drop },
    { offset: inner + w + ringGap, y: -drop - 0.2 },
  ]);
}

function hiddenHalo(ctx: HeadCtx): Part[] {
  const o = cleanOutline(ctx.center.built.outline);
  const pd = Math.max(0.1, ctx.center.built.pavilionDepth);
  const s = meleeSize(ctx);
  const w = accentDims(ctx, s).width;
  const f = num(ctx.params, 'hiddenDepth', 0.3, 0.1, 0.6);
  const y = -Math.min(f * pd + w * 0.3, ctx.baseDrop * 0.6);
  const sc = Math.max(0.3, 1 - Math.min(1, -y / pd));
  const tilt = (num(ctx.params, 'tilt', 40, 0, 75) * Math.PI) / 180;
  const path = offsetOutline(scaleOutline(o, sc), w / 2 + 0.25);
  const opts = prongOpts(ctx, { count: 4, style: 'round', rails: 0 });
  const metal: THREE.BufferGeometry[] = [...prongSet(ctx.center.built, { ...opts, rails: [] })];
  const r = accentRing(ctx, {
    path,
    size: s,
    y,
    spacing: num(ctx.params, 'meleeSpacing', 0.1, 0, 0.8),
    tilt,
    minCount: 8,
  });
  metal.push(...r.metal);
  metal.push(...struts(ctx, path, y - 0.5, opts.baseScale, opts.wireMm));
  return [metalPart(metal, 'hidden halo head'), accentPart([r.stones], 'hidden halo melee')];
}

function cluster(ctx: HeadCtx): Part[] {
  const o = cleanOutline(ctx.center.built.outline);
  const minDim = 2 * Math.min(support(o, 1, 0), support(o, 0, 1));
  const ratio = num(ctx.params, 'petalRatio', 0.42, 0.2, 0.8);
  const size = Math.max(1, Math.min(5, minDim * ratio));
  const w = accentDims(ctx, size).width;
  const gap = num(ctx.params, 'petalGap', 0.2, 0, 1);
  const path = offsetOutline(o, gap + w / 2 + 0.1);
  const opts = prongOpts(ctx, { count: 4, style: 'claw', rails: 0 });
  const metal: THREE.BufferGeometry[] = [...prongSet(ctx.center.built, { ...opts, rails: [] })];
  const y = -num(ctx.params, 'petalDrop', 0.25, 0, 1.5);
  const r = accentRing(ctx, {
    path,
    size,
    y,
    spacing: num(ctx.params, 'petalSpacing', 0.15, 0, 1),
    minCount: 6,
  });
  metal.push(...r.metal);
  // a scalloped gallery plate under the petals
  const plate: THREE.Vector3[] = [];
  for (let i = 0; i < 64; i++) {
    const p = pointAt(path, (i / 64) * path.perimeter);
    plate.push(v3(p.x * 0.85, y - size * 0.65, p.z * 0.85));
  }
  metal.push(loop(plate, Math.max(0.3, opts.wireMm * 0.4), 64, 6));
  metal.push(...struts(ctx, path, y - size * 0.6, opts.baseScale, opts.wireMm));
  return [metalPart(metal, 'cluster head'), accentPart([r.stones], 'cluster stones')];
}

registerHeadBuilder('halo-round', (ctx) => haloHead(ctx, 'follow', null));
registerHeadBuilder('halo-cushion', (ctx) => haloHead(ctx, 'cushion', null));
registerHeadBuilder('halo-oval', (ctx) => haloHead(ctx, 'oval', null));
registerHeadBuilder('double-halo', doubleHalo);
registerHeadBuilder('hidden-halo', hiddenHalo);
registerHeadBuilder('cluster', cluster);
