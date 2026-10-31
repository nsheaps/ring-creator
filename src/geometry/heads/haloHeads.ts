/**
 * Halo-family heads: halo (round / cushion / oval / follow), hidden halo, double halo and cluster.
 *
 * A halo is a ring of melee that touches the centre stone's girdle, with tables about level with that girdle, set in a
 * metal plate (a U-channel with a bright outer rim) and held by shared beads between neighbouring stones. The centre's
 * prongs pass through gaps left in the ring. The plate is carried down to the centre's seat by struts.
 */
import * as THREE from 'three';
import { registerHeadBuilder } from '../builders';
import type { BuiltStone, HeadCtx, Part } from '../types';
import { instanceGeometry, toFlat } from '../helpers';
import {
  accentDims,
  accentPart,
  arcAtDirection,
  ball,
  cleanOutline,
  loft,
  loop,
  metalPart,
  num,
  offsetOutline,
  placeMatrix,
  pointAt,
  prongSet,
  prongSites,
  resample,
  str,
  support,
  templateOutline,
  v3,
  wire,
  type CleanOutline,
  type PathPt,
  type ProngSetOpts,
  type V2,
} from './common';
import { prongOpts } from './prongHeads';

const HALO_SHAPES = ['follow', 'round', 'cushion', 'oval'] as const;
type HaloShape = (typeof HALO_SHAPES)[number];

function meleeSize(ctx: HeadCtx): number {
  const override = num(ctx.params, 'meleeSize', 0, 0, 4);
  return Math.min(3, Math.max(0.7, override > 0 ? override : ctx.accent.sizeMm || 1.2));
}

function haloPath(o: CleanOutline, shape: HaloShape, offset: number): CleanOutline {
  // a shaped template is grown radially, which is a little tighter than a true offset at sharp corners
  return shape === 'follow' ? offsetOutline(o, offset) : templateOutline(o, shape, offset + 0.08, 1.25);
}

/** Radial distance of an outline in direction (dx, dz) (good enough for convex-ish paths). */
function hit(o: CleanOutline, dx: number, dz: number): number {
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

/** Struts from a halo / cluster plate (at yTop, just inside `path`) down to the centre's seat ring, at the given angles. */
function struts(
  ctx: HeadCtx,
  path: CleanOutline,
  yTop: number,
  bs: number,
  wireMm: number,
  angles: number[],
): THREE.BufferGeometry[] {
  const o = cleanOutline(ctx.center.built.outline);
  const out: THREE.BufferGeometry[] = [];
  const r = wireMm * 0.42;
  for (const a of angles) {
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const rh = hit(path, dx, dz);
    const rb = hit(o, dx, dz) * bs;
    const top = v3(dx * rh, yTop, dz * rh);
    const bot = v3(dx * rb, -ctx.baseDrop + r, dz * rb);
    const mid = v3(dx * (rh * 0.6 + rb * 0.4), yTop + (bot.y - yTop) * 0.5, dz * (rh * 0.6 + rb * 0.4));
    out.push(...wire([top, mid, bot], r, 16, 7));
  }
  return out;
}

/** Directions (angles) of the centre's prong sites. */
function prongAngles(o: CleanOutline, opts: ProngSetOpts): number[] {
  const sites =
    opts.sites ?? prongSites(o, { count: opts.count, phase: opts.phase, useCorners: opts.useCorners });
  return sites.map((s) => {
    const p = pointAt(o, s);
    return Math.atan2(p.z, p.x);
  });
}

/**
 * Arc positions of `size` stones on `path`, leaving a gap of `block` mm centred on each blocked arc (where a prong
 * passes). Between blocks the stones are spread evenly, `spacing` apart or a little more. Without blocks: an even ring.
 */
function layout(
  path: CleanOutline,
  size: number,
  spacing: number,
  blocked: number[],
  block: number,
): number[] {
  const P = path.perimeter;
  const pitch = size + spacing;
  if (!blocked.length) {
    const n = Math.max(6, Math.floor(P / pitch));
    return Array.from({ length: n }, (_, i) => (i / n) * P);
  }
  const b = blocked.map((s) => ((s % P) + P) % P).sort((x, y) => x - y);
  const out: number[] = [];
  for (let i = 0; i < b.length; i++) {
    const a = b[i] + block / 2;
    const e = (i + 1 < b.length ? b[i + 1] : b[0] + P) - block / 2;
    const avail = e - a;
    // one more stone when it nearly fits: it may then reach a little into the prong's gap (the prong sits on the
    // melee edges, as in a real halo), never more than 0.8 of it
    let n = Math.floor(avail / pitch + 0.4);
    if (n * pitch > avail + block * 0.8) n--;
    if (n < 1) continue;
    const span = Math.max(avail, n * pitch);
    const step = span / n;
    const s0 = (a + e) / 2 - span / 2;
    for (let j = 0; j < n; j++) out.push(s0 + step * (j + 0.5));
  }
  return out;
}

interface RingOpts {
  path: CleanOutline;
  built: BuiltStone;
  /** arc positions of the stone centres */
  arcs: number[];
  /** y of the stone girdles */
  y: number;
  /** tables tilted outward (radians) */
  tilt?: number;
  /** keep each stone's own +X along this fixed direction instead of the path tangent (petals). */
  fixedX?: [number, number];
}

interface RingOut {
  stones: THREE.BufferGeometry;
  centers: PathPt[];
}

function stoneRing(o: RingOpts): RingOut {
  const centers: PathPt[] = [];
  const mats: THREE.Matrix4[] = [];
  const tilt = o.tilt ?? 0;
  const P = o.path.perimeter;
  for (const s of o.arcs) {
    const p = pointAt(o.path, s);
    const a = pointAt(o.path, s - P * 0.01);
    const b = pointAt(o.path, s + P * 0.01);
    const t = [b.x - a.x, b.z - a.z];
    const l = Math.hypot(t[0], t[1]) || 1;
    p.tx = t[0] / l;
    p.tz = t[1] / l;
    p.nx = p.tz;
    p.nz = -p.tx;
    centers.push(p);
    const ux = o.fixedX ? o.fixedX[0] : p.tx;
    const uz = o.fixedX ? o.fixedX[1] : p.tz;
    mats.push(placeMatrix(p.x, o.y, p.z, ux, uz, tilt, p.nx, p.nz));
  }
  return { stones: instanceGeometry(toFlat(o.built.geometry), mats), centers };
}

interface PlateOpts {
  path: CleanOutline;
  /** half width of the stones across the path */
  w: number;
  y: number;
  crown: number;
  depth: number;
  tilt?: number;
  /** bright rim on the outer edge rising this far above the girdle (0 = none) */
  rim?: number;
}

/** The halo plate: a rounded U-channel under the stones, its outer wall rising into a thin bright rim. */
function plate(o: PlateOpts): THREE.BufferGeometry {
  const cosT = Math.cos(o.tilt ?? 0);
  const sinT = Math.sin(o.tilt ?? 0);
  const rot = (u: number, v: number): V2 => [u * cosT + v * sinT, o.y - u * sinT + v * cosT];
  const w = o.w;
  const e = Math.min(0.2, w * 0.25);
  const rim = o.rim ?? 0;
  const section: V2[] = [
    rot(-w + 0.04, -0.1),
    rot(-w - e * 0.4, -o.depth * 0.45),
    rot(-w * 0.55, -o.depth),
    rot(w * 0.55, -o.depth),
    rot(w + e, -o.depth * 0.5),
    rot(w + e, rim > 0 ? rim : 0),
    rot(w + e * 0.15, rim > 0 ? rim : 0),
    rot(w - 0.04, 0.0),
  ];
  return loft(resample(o.path, 144, 1), section, true);
}

/** Shared beads between neighbouring stones (only between stones that are close), pressed onto both crowns. */
function beads(
  path: CleanOutline,
  arcs: number[],
  built: BuiltStone,
  size: number,
  width: number,
  y: number,
  maxGap: number,
  tilt = 0,
  /** stones right against the centre girdle: no inner rim beads, a bead in the middle of each junction instead */
  tight = false,
  radius = Math.max(0.12, width * 0.15),
): THREE.BufferGeometry | null {
  const P = path.perimeter;
  const sorted = arcs.slice().sort((a, b) => a - b);
  const w = width / 2;
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);
  const mats: THREE.Matrix4[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const b = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + P;
    if (b - a > size + maxGap) continue;
    const p = pointAt(path, (a + b) / 2);
    for (const side of tight ? [0, 1] : [-1, 1]) {
      const u = side * w * 0.72;
      const v = built.crownHeight * 0.35 + built.girdleThickness * 0.5 + radius * 0.3;
      const off = u * cosT + v * sinT;
      const yy = y - u * sinT + v * cosT;
      mats.push(new THREE.Matrix4().makeTranslation(p.x + p.nx * off, yy, p.z + p.nz * off));
    }
  }
  if (!mats.length) return null;
  return instanceGeometry(toFlat(new THREE.IcosahedronGeometry(radius, 1)), mats);
}

interface HaloRow {
  /** distance from the centre girdle to the inner edge of this row's stones */
  inset: number;
  /** extra drop of the row's tables below the centre girdle */
  drop: number;
  /** leave gaps for the centre's prongs */
  blockProngs: boolean;
}

function haloHead(ctx: HeadCtx, defShape: HaloShape, rows: HaloRow[] | null): Part[] {
  const o = cleanOutline(ctx.center.built.outline);
  const s = meleeSize(ctx);
  const dims = accentDims(ctx, s);
  const w = dims.width;
  const built = ctx.stone(ctx.accent.cut.id, dims, { detail: 'low' });
  const gap = num(ctx.params, 'haloGap', 0.08, 0, 1.5);
  const spacing = num(ctx.params, 'meleeSpacing', 0.06, 0, 0.8);
  const drop = num(ctx.params, 'haloDrop', 0.1, 0, 1.5);
  const shape = str(ctx.params, 'haloShape', HALO_SHAPES, defShape);
  const opts = prongOpts(ctx, { count: 4, style: 'round', rails: 0 });
  const metal: THREE.BufferGeometry[] = [...prongSet(ctx.center.built, { ...opts, rails: [] })];
  const stones: THREE.BufferGeometry[] = [];
  const angles = prongAngles(o, opts);
  const block = opts.wireMm + 0.12;
  const spec = rows ?? [{ inset: gap, drop, blockProngs: true }];
  let outer: { path: CleanOutline; y: number } | null = null;
  for (const row of spec) {
    const path = haloPath(o, shape, row.inset + w / 2);
    const yg = -(row.drop + built.crownHeight + built.girdleThickness * 0.5);
    const blocked = row.blockProngs ? angles.map((a) => arcAtDirection(path, Math.cos(a), Math.sin(a))) : [];
    const arcs = layout(path, dims.length, spacing, blocked, block);
    const ring = stoneRing({ path, built, arcs, y: yg });
    stones.push(ring.stones);
    const depth = built.pavilionDepth + built.girdleThickness * 0.5 + 0.25;
    metal.push(
      plate({ path, w: w / 2, y: yg, crown: built.crownHeight, depth, rim: built.crownHeight * 0.3 }),
    );
    const bd = beads(path, arcs, built, dims.length, w, yg, spacing + 0.4, 0, row.inset < 0.25);
    if (bd) metal.push(bd);
    outer = { path, y: yg - depth };
  }
  if (outer) {
    const between = angles.map((a, i) => {
      const b = angles[(i + 1) % angles.length];
      let d = b - a;
      while (d <= 0) d += Math.PI * 2;
      return a + d / 2;
    });
    metal.push(...struts(ctx, outer.path, outer.y + 0.15, opts.baseScale, opts.wireMm, between));
  }
  return [metalPart(metal, 'halo head'), accentPart(stones, 'halo melee')];
}

function doubleHalo(ctx: HeadCtx): Part[] {
  const s = meleeSize(ctx);
  const w = accentDims(ctx, s).width;
  const gap = num(ctx.params, 'haloGap', 0.08, 0, 1.5);
  const drop = num(ctx.params, 'haloDrop', 0.1, 0, 1.5);
  const ringGap = num(ctx.params, 'ringGap', 0.25, 0.1, 1.5);
  return haloHead(ctx, 'follow', [
    { inset: gap, drop, blockProngs: true },
    { inset: gap + w + ringGap, drop: drop + 0.15, blockProngs: false },
  ]);
}

/**
 * Hidden halo: melee tucked right under the centre's girdle, tilted outward, hugging the pavilion. Seen from above it is
 * a solitaire; from the side a band of sparkle shows under the stone.
 */
function hiddenHalo(ctx: HeadCtx): Part[] {
  const o = cleanOutline(ctx.center.built.outline);
  const cb = ctx.center.built;
  const pd = Math.max(0.2, cb.pavilionDepth);
  const s = meleeSize(ctx);
  const dims = accentDims(ctx, s);
  const w = dims.width;
  const built = ctx.stone(ctx.accent.cut.id, dims, { detail: 'low' });
  const tilt = (num(ctx.params, 'tilt', 40, 0, 75) * Math.PI) / 180;
  const extra = num(ctx.params, 'hiddenDepth', 0.15, 0, 0.6) * pd * 0.5;
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);
  // top of the melee (its inner crown edge) just under the girdle
  const yg = -(cb.girdleThickness * 0.5 + 0.08 + extra + (w / 2) * sinT + built.crownHeight * cosT);
  // push the ring out until the melee's inner girdle edge and culet both clear the pavilion
  // (the narrowest direction is the strictest: there the pavilion's slope reaches out furthest relative to its size)
  const R = Math.min(support(o, 1, 0), support(o, 0, 1), support(o, -1, 0), support(o, 0, -1));
  const cone = (y: number) => R * Math.max(0, 1 + y / pd); // pavilion radius at height y (< 0)
  const inner = { r: -(w / 2) * cosT, y: yg + (w / 2) * sinT };
  const culet = { r: -built.pavilionDepth * sinT, y: yg - built.pavilionDepth * cosT };
  let d = 0;
  for (const q of [inner, culet]) d = Math.max(d, cone(q.y) - R + 0.12 - q.r);
  const path = offsetOutline(o, d);
  const opts = prongOpts(ctx, { count: 4, style: 'round', rails: 0 });
  const metal: THREE.BufferGeometry[] = [...prongSet(cb, { ...opts, rails: [] })];
  const angles = prongAngles(o, opts);
  const blocked = angles.map((a) => arcAtDirection(path, Math.cos(a), Math.sin(a)));
  const arcs = layout(
    path,
    dims.length,
    num(ctx.params, 'meleeSpacing', 0.06, 0, 0.8),
    blocked,
    opts.wireMm + 0.1,
  );
  const ring = stoneRing({ path, built, arcs, y: yg, tilt });
  const depth = built.pavilionDepth + 0.2;
  metal.push(plate({ path, w: w / 2, y: yg, crown: built.crownHeight, depth, tilt }));
  const bd = beads(path, arcs, built, dims.length, w, yg, 0.5, tilt, true);
  if (bd) metal.push(bd);
  const between = angles.map((a, i) => {
    const b = angles[(i + 1) % angles.length];
    let dd = b - a;
    while (dd <= 0) dd += Math.PI * 2;
    return a + dd / 2;
  });
  metal.push(...struts(ctx, path, yg - depth * cosT + 0.1, opts.baseScale, opts.wireMm, between));
  return [metalPart(metal, 'hidden halo head'), accentPart([ring.stones], 'hidden halo melee')];
}

/**
 * Cluster: a ring of petal stones that touch the centre and each other, all the same size and evenly spaced, tables
 * a little below the centre's girdle. The centre's claws sit in the V between petals; shared claws hold the petals'
 * outer edges; an open gallery underneath carries them down to the centre's seat.
 */
/** Centre prong counts a cluster can use, best first: the petal count is chosen to be a multiple of one of them. */
const PRONG_COUNTS = [4, 6, 5, 3] as const;

function cluster(ctx: HeadCtx): Part[] {
  const o = cleanOutline(ctx.center.built.outline);
  const minDim = 2 * Math.min(support(o, 1, 0), support(o, 0, 1));
  const ratio = num(ctx.params, 'petalRatio', 0.42, 0.2, 0.8);
  const gap = num(ctx.params, 'petalGap', 0.12, 0, 1);
  const spacing = num(ctx.params, 'petalSpacing', 0.08, 0, 1);
  const cut = ctx.accent.cut;
  const aspect = Math.max(1, cut.defaultAspect || 1);
  let size = Math.max(1, Math.min(5, minDim * ratio));
  // choose a petal count that tiles the ring exactly and lets the centre's prongs fall between petals
  let path = offsetOutline(o, gap + size / 2);
  const ideal = path.perimeter / (size * aspect + spacing);
  let n = Math.max(6, Math.round(ideal));
  let best = Infinity;
  for (let c = Math.max(6, Math.floor(ideal * 0.8)); c <= Math.max(6, Math.ceil(ideal * 1.2)); c++) {
    const k = PRONG_COUNTS.find((q) => c % q === 0);
    if (!k) continue;
    const cost = Math.abs(c - ideal) + PRONG_COUNTS.indexOf(k) * 0.3;
    if (cost < best) {
      best = cost;
      n = c;
    }
  }
  for (let k = 0; k < 4; k++) {
    size = Math.max(0.8, (path.perimeter / n - spacing) / aspect);
    path = offsetOutline(o, gap + size / 2);
  }
  const prongs = PRONG_COUNTS.find((k) => n % k === 0) ?? 4;
  const dims = { length: size * aspect, width: size, depth: size * (cut.defaultDepthPct || 0.6) };
  const built = ctx.stone(cut.id, dims, { detail: 'low' });
  const drop = num(ctx.params, 'petalDrop', 0.2, 0, 1.5);
  const yg = -(drop + built.crownHeight + built.girdleThickness * 0.5);
  const P = path.perimeter;
  const start = arcAtDirection(path, 1, 0);
  const arcs = Array.from({ length: n }, (_, i) => start + ((i + 0.5) / n) * P);
  const ring = stoneRing({ path, built, arcs, y: yg });
  // centre claws at every (n / prongs)-th junction, aimed at the V between two petals
  const step = n / prongs;
  const sites: number[] = [];
  for (let k = 0; k < prongs; k++) {
    const p = pointAt(path, start + ((k * step) / n) * P);
    sites.push(arcAtDirection(o, p.x, p.z));
  }
  const opts = prongOpts(ctx, { count: prongs, style: 'claw', rails: 0 });
  const metal: THREE.BufferGeometry[] = [...prongSet(ctx.center.built, { ...opts, sites, rails: [] })];
  // shared claws on the outer junctions, and small beads on inner junctions without a centre claw
  const wr = Math.max(0.2, Math.min(opts.wireMm * 0.4, size * 0.13));
  const ppd = built.pavilionDepth;
  const railY = yg - ppd * 0.75;
  const railK = size * 0.18;
  const tipY = yg + built.girdleThickness * 0.5 + built.crownHeight * 0.45;
  for (let i = 0; i < n; i++) {
    const p = pointAt(path, start + (i / n) * P);
    const r = Math.hypot(p.x, p.z) || 1;
    const dx = p.x / r;
    const dz = p.z / r;
    // where two petals touch, their outer edges leave a V at about size/2 outside the path
    const outR = r + size * 0.42;
    const tip = v3(dx * (r + size * 0.3), tipY, dz * (r + size * 0.3));
    const knee = v3(dx * (outR + wr * 0.4), yg + wr * 0.2, dz * (outR + wr * 0.4));
    const foot = v3(dx * (r + railK), railY, dz * (r + railK));
    metal.push(...wire([foot, knee, tip], wr, 12, 7));
    metal.push(ball(tip, wr * 1.15, 1));
    if (i % step !== 0) {
      const inR = r - size * 0.32;
      metal.push(ball(v3(dx * inR, tipY - 0.05, dz * inR), wr * 0.9, 1));
    }
  }
  // the gallery: a rail under the petals' pavilions, a smaller one near the centre, struts to the seat
  const rail = (k: number, y: number, rr: number) => {
    const pts = resample(path, 96, 1).map((q) => v3(q.x + q.nx * k, y, q.z + q.nz * k));
    metal.push(loop(pts, rr, 128, 7));
  };
  rail(railK, railY, wr);
  rail(-size * 0.25, yg - ppd * 0.45, wr * 0.8);
  const angles = Array.from({ length: prongs }, (_, k) => {
    const p = pointAt(path, start + (((k + 0.5) * step) / n) * P);
    return Math.atan2(p.z, p.x);
  });
  metal.push(...struts(ctx, path, railY, opts.baseScale, opts.wireMm, angles));
  return [metalPart(metal, 'cluster head'), accentPart([ring.stones], 'cluster stones')];
}

registerHeadBuilder('halo-round', (ctx) => haloHead(ctx, 'follow', null));
registerHeadBuilder('halo-cushion', (ctx) => haloHead(ctx, 'cushion', null));
registerHeadBuilder('halo-oval', (ctx) => haloHead(ctx, 'oval', null));
registerHeadBuilder('double-halo', doubleHalo);
registerHeadBuilder('hidden-halo', hiddenHalo);
registerHeadBuilder('cluster', cluster);
