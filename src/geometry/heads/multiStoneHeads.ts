/**
 * Multi-stone heads: three-stone, five-stone, toi-et-moi and bypass.
 *
 * Extra stones sit along ctx.bandAxis ON THE CURVE OF THE FINGER: each one is placed on a circle concentric with the
 * shank, tilted so its table follows the shoulder, with its culet just above the shank top and its own prong basket
 * standing on the shank. Everything is built in the centre stone's frame (girdle plane y = 0).
 */
import * as THREE from 'three';
import { registerHeadBuilder } from '../builders';
import type { BuiltStone, HeadCtx, Part } from '../types';
import type { StoneDims } from '@/models/stoneMath';
import type { CutModel } from '@/models/types';
import { findModel, getModel } from '@/models/registry';
import {
  PRONG_STYLES,
  autoWireMm,
  accentPart,
  bool,
  cleanOutline,
  metalPart,
  num,
  placeMatrix,
  prongSet,
  ringDrop,
  shankTopRadius,
  str,
  support,
  transformAll,
  v3,
  wire,
  type ProngStyle,
} from './common';
import { prongOpts } from './prongHeads';

// ---------------------------------------------------------------------------------------------
// Placement on the finger's curve
// ---------------------------------------------------------------------------------------------

/** y of the shank's top surface at distance u along the band (stone frame). */
function shankY(ctx: HeadCtx, u: number): number {
  return -(ctx.baseDrop + ringDrop(ctx, u));
}

export interface SideStone {
  built: BuiltStone;
  /** stone-frame (x, z) direction of the side stone's own +X axis */
  localX: [number, number];
}

export interface Seated {
  m: THREE.Matrix4;
  /** along-band extent of the girdle (signed u, head frame) */
  uMin: number;
  uMax: number;
  /** along-band position of the stone's centre */
  u: number;
  /** y of the shank top under the stone */
  seat: number;
  tilt: number;
}

/**
 * Seat a stone at arc angle phi from the top of the ring (sign picks the side), `across` mm off the band's centre line.
 * Its table is tilted by tiltK * phi (1 = fully follows the finger's curve), and the culet sits `clear` mm above the
 * shank top.
 */
export function seatAt(
  ctx: HeadCtx,
  s: SideStone,
  sign: 1 | -1,
  phi: number,
  across: number,
  clear: number,
  tiltK: number,
): Seated {
  const [ax, az] = ctx.bandAxis;
  const px = -az;
  const pz = ax;
  const b = s.built;
  const Rs = shankTopRadius(ctx);
  const Rg = Rs + clear + b.pavilionDepth + b.girdleThickness * 0.5;
  const u = Rg * Math.sin(phi);
  const tilt = phi * tiltK;
  const build = (y: number) =>
    placeMatrix(
      sign * ax * u + px * across,
      y,
      sign * az * u + pz * across,
      s.localX[0],
      s.localX[1],
      tilt,
      sign * ax,
      sign * az,
    );
  // first guess on the circle, then lift/lower so the culet clears the real shank by `clear`
  let m = build(-(ctx.baseDrop + Rs) + Rg * Math.cos(phi));
  const culet = v3(0, -b.pavilionDepth, 0).applyMatrix4(m);
  const cu = (culet.x * ax + culet.z * az) * sign;
  const dy = shankY(ctx, cu) + clear - culet.y;
  m = build(-(ctx.baseDrop + Rs) + Rg * Math.cos(phi) + dy);
  const o = cleanOutline(b.outline);
  let uMin = Infinity;
  let uMax = -Infinity;
  for (const p of o.pts) {
    const w = v3(p[0], 0, p[1]).applyMatrix4(m);
    const along = w.x * ax + w.z * az;
    uMin = Math.min(uMin, along);
    uMax = Math.max(uMax, along);
  }
  return { m, uMin, uMax, u: sign * u, seat: shankY(ctx, u), tilt };
}

/** Find the arc angle at which the stone's near girdle edge sits at `edge` (signed by side) along the band. */
export function seatBeside(
  ctx: HeadCtx,
  s: SideStone,
  sign: 1 | -1,
  edge: number,
  across: number,
  clear: number,
  tiltK: number,
): Seated {
  const near = (q: Seated) => (sign > 0 ? q.uMin : -q.uMax);
  let lo = 0;
  // never further round than ~57 degrees: beyond that a stone would hang off the side of the finger
  let hi = 1.0;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (near(seatAt(ctx, s, sign, mid, across, clear, tiltK)) < edge) lo = mid;
    else hi = mid;
  }
  return seatAt(ctx, s, sign, hi, across, clear, tiltK);
}

/**
 * A prong basket for a seated stone, standing on the shank: the seat ring lies on the shank surface under the stone
 * (following its curve) and sinks 0.12 mm into it.
 */
export function basket(
  ctx: HeadCtx,
  s: SideStone,
  q: Seated,
  o: { count: number; style: ProngStyle; wireMm: number; rails: number[]; baseScale: number },
): THREE.BufferGeometry[] {
  const b = s.built;
  const down = v3(0, -1, 0).transformDirection(q.m);
  const culet = v3(0, -b.pavilionDepth, 0).applyMatrix4(q.m);
  const [ax, az] = ctx.bandAxis;
  const sy = (p: THREE.Vector3) => shankY(ctx, p.x * ax + p.z * az);
  // march down the stone's own axis to the shank
  let d = 0;
  const p = culet.clone();
  while (d < 6 && p.y > sy(p)) {
    d += 0.02;
    p.copy(culet).addScaledVector(down, d);
  }
  const baseY = -(b.pavilionDepth + d + 0.12);
  // the seat ring follows the shank: march each seat point down the stone's own axis until it sinks 0.12 mm into it
  const seatDrop = (x: number, z: number) => {
    const w0 = v3(x, baseY + 0.12, z).applyMatrix4(q.m);
    const w = w0.clone();
    let k = 0;
    while (k < 4 && w.y > sy(w)) {
      k += 0.02;
      w.copy(w0).addScaledVector(down, k);
    }
    return Math.max(0, k - 0.12);
  };
  // long stones get a seat of about the same size as short ones (a narrow foot on the shank)
  const so = cleanOutline(b.outline);
  const half = Math.max(support(so, 1, 0), support(so, -1, 0), support(so, 0, 1), support(so, 0, -1));
  const geos = prongSet(b, {
    count: o.count,
    style: o.style,
    wireMm: o.wireMm,
    baseY,
    baseScale: Math.min(o.baseScale, 2.4 / Math.max(0.1, half)),
    rails: o.rails,
    seatDrop,
  });
  return transformAll(geos, q.m);
}

/** Two bars lying on the shank top that join the seats of neighbouring baskets (the shared under-gallery). */
export function seatBars(
  ctx: HeadCtx,
  a: number,
  b: number,
  r: number,
  acrossA = 0,
  acrossB = 0,
): THREE.BufferGeometry[] {
  const [ax, az] = ctx.bandAxis;
  const px = -az;
  const pz = ax;
  const out: THREE.BufferGeometry[] = [];
  if (Math.abs(b - a) < 0.2) return out;
  const half = Math.min(ctx.shankWidth * 0.28, 0.75);
  for (const k of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const u = a + (b - a) * t;
      const off = acrossA + (acrossB - acrossA) * t + k * half;
      pts.push(v3(ax * u + px * off, shankY(ctx, u) + r * 0.6, az * u + pz * off));
    }
    out.push(...wire(pts, r, 24, 7));
  }
  return out;
}

/** A gallery rail at height y joining two baskets (a bar from one rail to the next, following the curve). */
function railBridge(ctx: HeadCtx, a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.BufferGeometry[] {
  const mid = a.clone().lerp(b, 0.5);
  const [ax, az] = ctx.bandAxis;
  const u = mid.x * ax + mid.z * az;
  // sag the middle slightly so the bar follows the ring's curve, but never below the shank
  mid.y = Math.max(shankY(ctx, u) + r, mid.y - Math.abs(a.y - b.y) * 0.15);
  return wire([a, mid, b], r, 12, 7);
}

// ---------------------------------------------------------------------------------------------
// Side stone shapes
// ---------------------------------------------------------------------------------------------

/**
 * A side stone whose extent ACROSS the band is about `size` mm.
 * Round-ish cuts: as they are. Triangles (trillions): one flat side faces the centre and the point faces away from it,
 * so the flat side (the stone's length) runs across the band. Elongated step cuts (baguettes, emerald cuts): long axis
 * across the band, i.e. along the finger, parallel to the side of the centre stone. Other elongated cuts (pear,
 * marquise, oval, tapered baguettes): long axis along the band, the pear's point facing away from the centre.
 * `aspect` (length:width, 0 = automatic) sets the proportions of elongated cuts; automatic uses the cut's default,
 * capped at 2.2:1 for step cuts so a long baguette does not turn into a sliver.
 */
export function sideStone(
  ctx: HeadCtx,
  cut: CutModel,
  size: number,
  sign: 1 | -1,
  detail: 'full' | 'low',
  aspectOverride = 0,
): SideStone {
  const [ax, az] = ctx.bandAxis;
  const px = -az;
  const pz = ax;
  const aspect = Math.max(1, cut.defaultAspect || 1);
  const custom = aspectOverride >= 1 ? aspectOverride : 0;
  const depthPct = cut.defaultDepthPct || 0.6;
  let dims: StoneDims;
  let localX: [number, number];
  if (isTriangle(cut)) {
    // the triangle builder puts the flat side along +X at +z and the apex at -z: turn -z to face away from the centre
    dims = { length: size, width: size / aspect, depth: (size / aspect) * depthPct };
    localX = [sign * px, sign * pz];
  } else if (aspect < 1.25) {
    dims = { length: size * aspect, width: size, depth: size * depthPct };
    localX = [sign * ax, sign * az];
  } else if (cut.builder === 'step') {
    const length = size * 1.1;
    const width = length / (custom || Math.min(aspect, 2.2));
    dims = { length, width, depth: width * depthPct };
    localX = [px, pz];
  } else {
    const width = size * 0.85;
    dims = { length: width * (custom || aspect), width, depth: width * depthPct };
    localX = [sign * ax, sign * az];
  }
  return { built: ctx.stone(cut.id, dims, { detail }), localX };
}

/** Triangular cuts (trillions): set with their flat side to the centre and three prongs, one per corner. */
export function isTriangle(cut: CutModel): boolean {
  return cut.params.shape === 'triangle';
}

/**
 * The cut of one side position. 'accent' is the accent stone's cut, 'match' a smaller copy of the centre, any other
 * value a cut id (unknown ids fall back to the accent cut).
 */
export function sideCutFor(ctx: HeadCtx, key: string): CutModel | 'match' {
  if (key === 'match') return 'match';
  if (key === 'accent' || !key) return ctx.accent.cut;
  return findModel('cut', key) ?? ctx.accent.cut;
}

/** A smaller copy of the centre stone (same cut and orientation) whose extent across the band is `size`. */
export function matchStone(ctx: HeadCtx, size: number, mirror: boolean, detail: 'full' | 'low'): SideStone {
  const o = cleanOutline(ctx.center.built.outline);
  const [ax, az] = ctx.bandAxis;
  const across = support(o, -az, ax) + support(o, az, -ax);
  const k = size / Math.max(0.1, across);
  const c = ctx.center.dims;
  return {
    built: ctx.stone(
      ctx.center.cut.id,
      { length: c.length * k, width: c.width * k, depth: c.depth * k },
      { detail },
    ),
    localX: mirror ? [-1, 0] : [1, 0],
  };
}

export function centreAcross(ctx: HeadCtx): number {
  const o = cleanOutline(ctx.center.built.outline);
  const [ax, az] = ctx.bandAxis;
  return support(o, -az, ax) + support(o, az, -ax);
}

/** Centre-stone prongs and gallery; returns the geometry and the y of its first rail (for rail bridges). */
export function centreBasket(
  ctx: HeadCtx,
  style: ProngStyle,
): { geos: THREE.BufferGeometry[]; wireMm: number } {
  const opts = prongOpts(ctx, { count: 4, style, rails: 1, useCorners: true });
  return { geos: prongSet(ctx.center.built, opts), wireMm: opts.wireMm };
}

/** World position of the point where a basket's first rail crosses the band axis, on the side facing `dir`. */
function railPoint(
  ctx: HeadCtx,
  built: BuiltStone,
  m: THREE.Matrix4,
  baseY: number,
  dir: 1 | -1,
  frac = 0.3,
): THREE.Vector3 {
  const o = cleanOutline(built.outline);
  const [ax, az] = ctx.bandAxis;
  const inv = new THREE.Matrix4().extractRotation(m).transpose();
  const d = v3(dir * ax, 0, dir * az).applyMatrix4(inv);
  const h = support(o, d.x, d.z);
  const y = baseY * frac;
  const k = 1 - frac * 0.5;
  return v3(d.x * h * k, y, d.z * h * k).applyMatrix4(m);
}

// ---------------------------------------------------------------------------------------------
// Three-stone and five-stone
// ---------------------------------------------------------------------------------------------

/**
 * Three-stone (one side stone per side) and five-stone (two per side). `sideCut` picks the cut next to the centre,
 * `outerCut` the cut of the outer stones: on a five-stone 'same' repeats the side cut; on a three-stone anything but
 * 'none' adds a smaller outer stone per side, e.g. a baguette then a trillion pointing away from the centre.
 */
function multiStone(ctx: HeadCtx, five: boolean): Part[] {
  const o = cleanOutline(ctx.center.built.outline);
  const p = ctx.params;
  const [ax, az] = ctx.bandAxis;
  const across = centreAcross(ctx);
  const ratio = num(p, 'sideRatio', five ? 0.55 : 0.62, 0.25, 1);
  const ratio2 = num(p, 'outerRatio', 0.78, 0.4, 1);
  /** length:width of elongated side stones (baguettes, emerald cuts, pears); 0 = automatic */
  const sideAspect = num(p, 'sideAspect', 0, 0, 5);
  const gap = num(p, 'sideGap', 0.3, 0, 2);
  const sideKey = typeof p.sideCut === 'string' ? p.sideCut : 'accent';
  const outerRaw = typeof p.outerCut === 'string' && p.outerCut ? p.outerCut : five ? 'same' : 'none';
  const outerKey = outerRaw === 'same' ? sideKey : outerRaw;
  const perSide = five || outerRaw !== 'none' ? 2 : 1;
  const cuts = [sideCutFor(ctx, sideKey), sideCutFor(ctx, outerKey)];
  const style = str(p, 'prongStyle', PRONG_STYLES, 'round');
  const sideProngs = Math.round(num(p, 'sideProngs', 4, 3, 6));
  const centre = centreBasket(ctx, style);
  const metal: THREE.BufferGeometry[] = [...centre.geos];
  const stones: THREE.BufferGeometry[] = [];
  const r = centre.wireMm * 0.4;
  // side culets sit just above the shank (a little higher than flush so the basket has room)
  const clear = Math.min(0.5, Math.max(0.3, ctx.baseDrop - ctx.center.built.pavilionDepth) * 0.5);
  for (const sign of [-1, 1] as const) {
    let edge = support(o, sign * ax, sign * az) + gap;
    let size = across * ratio;
    let lastU = 0;
    for (let k = 0; k < perSide; k++) {
      const detail = five && k === 1 ? 'low' : 'full';
      const cut = cuts[k];
      const s =
        cut === 'match'
          ? matchStone(ctx, size, false, detail)
          : sideStone(ctx, cut, size, sign, detail, sideAspect);
      const q = seatBeside(ctx, s, sign, edge, 0, clear, 1);
      stones.push(s.built.geometry.clone().applyMatrix4(q.m));
      const wireMm = num(p, 'prongWidth', 0, 0, 1.6) * 0.8 || autoWireMm(s.built);
      metal.push(
        ...basket(ctx, s, q, {
          count: cut !== 'match' && isTriangle(cut) ? 3 : sideProngs,
          style,
          wireMm,
          rails: [0.4],
          baseScale: 0.45,
        }),
      );
      metal.push(...seatBars(ctx, lastU, q.u, r));
      edge = (sign > 0 ? q.uMax : -q.uMin) + gap;
      lastU = q.u;
      size *= ratio2;
    }
  }
  return [metalPart(metal, five ? 'five-stone head' : 'three-stone head'), accentPart(stones, 'side stones')];
}

// ---------------------------------------------------------------------------------------------
// Toi-et-moi and bypass: a second stone of its own cut
// ---------------------------------------------------------------------------------------------

/**
 * The second stone of a pair. secondCut: 'match' (the centre's cut and shape), 'accent' (the accent stone's cut) or a
 * cut id. Its size is set so its face area is ratio^2 of the centre's: a 0.9 ratio pear beside an emerald cut looks
 * like a near-equal partner.
 */
function secondStone(ctx: HeadCtx, ratio: number, mirror: boolean, defCut: string): SideStone {
  const v = ctx.params.secondCut;
  const key = typeof v === 'string' && v ? v : defCut;
  if (key === 'match' || key === ctx.center.cut.id) {
    const c = ctx.center.dims;
    return {
      built: ctx.stone(
        ctx.center.cut.id,
        { length: c.length * ratio, width: c.width * ratio, depth: c.depth * ratio },
        { detail: 'full' },
      ),
      localX: mirror ? [-1, 0] : [1, 0],
    };
  }
  const cut =
    key === 'accent' ? ctx.accent.cut : (findModel('cut', key) ?? getModel('cut', ctx.center.cut.id));
  const c = ctx.center.dims;
  const area = c.length * c.width * ratio * ratio;
  const aspect = Math.max(1, cut.defaultAspect || 1);
  const width = Math.sqrt(area / aspect);
  const length = width * aspect;
  // same orientation as the centre: elongated stones point along the centre's length
  return {
    built: ctx.stone(
      cut.id,
      { length, width, depth: width * (cut.defaultDepthPct || 0.6) },
      { detail: 'full' },
    ),
    localX: mirror ? [-1, 0] : [1, 0],
  };
}

function toiEtMoi(ctx: HeadCtx): Part[] {
  const o = cleanOutline(ctx.center.built.outline);
  const p = ctx.params;
  const [ax, az] = ctx.bandAxis;
  const ratio = num(p, 'secondRatio', 0.95, 0.4, 1.2);
  const gap = num(p, 'secondGap', 0.35, 0, 2);
  const mirror = bool(p, 'mirrorSecond', true);
  const style = str(p, 'prongStyle', PRONG_STYLES, 'claw');
  const s = secondStone(ctx, ratio, mirror, 'match');
  const opts = prongOpts(ctx, { count: 4, style, rails: 1, useCorners: true });
  const metal: THREE.BufferGeometry[] = [...prongSet(ctx.center.built, opts)];
  // both stones sit at the same height over the shank
  const clear = Math.max(
    0.3,
    ctx.baseDrop - ctx.center.built.pavilionDepth - ctx.center.built.girdleThickness * 0.5,
  );
  // tilt with the curve: once the pair is rolled onto the top of the finger both lean out equally
  const q = seatBeside(ctx, s, 1, support(o, ax, az) + gap, 0, clear, 1);
  metal.push(
    ...basket(ctx, s, q, {
      count: Math.round(num(p, 'prongCount', 4, 3, 6)),
      style,
      wireMm: opts.wireMm * 0.95,
      rails: [0.3],
      baseScale: 0.45,
    }),
  );
  // the shared basket: gallery bars from rail to rail and bars along the shank
  const r = opts.wireMm * 0.42;
  const cRail = railPoint(ctx, ctx.center.built, new THREE.Matrix4(), -ctx.baseDrop, 1);
  const sRail = railPoint(ctx, s.built, q.m, -(s.built.pavilionDepth + clear), -1);
  const [px, pz] = [-az, ax];
  for (const k of [-1, 1]) {
    const off = v3(px, 0, pz).multiplyScalar(k * Math.min(1.2, support(o, px, pz) * 0.45));
    metal.push(...railBridge(ctx, cRail.clone().add(off), sRail.clone().add(off), r));
  }
  metal.push(...seatBars(ctx, 0, q.u, r));
  return [
    metalPart(metal, 'toi-et-moi head'),
    accentPart([s.built.geometry.clone().applyMatrix4(q.m)], 'second stone'),
  ];
}

function bypassHead(ctx: HeadCtx): Part[] {
  const o = cleanOutline(ctx.center.built.outline);
  const p = ctx.params;
  const [ax, az] = ctx.bandAxis;
  const px = -az;
  const pz = ax;
  const ratio = num(p, 'secondRatio', 0.8, 0.3, 1.2);
  const gap = num(p, 'secondGap', 0.1, -1, 2);
  const shift = num(p, 'bypassShift', 0.35, 0, 0.8);
  const mirror = bool(p, 'mirrorSecond', true);
  const style = str(p, 'prongStyle', PRONG_STYLES, 'round');
  const s = secondStone(ctx, ratio, mirror, 'match');
  const wc = Math.min(support(o, px, pz), support(o, -px, -pz));
  const off = wc * 2 * shift;
  const opts = prongOpts(ctx, { count: 4, style, rails: 1, useCorners: true });
  const metal: THREE.BufferGeometry[] = [...prongSet(ctx.center.built, opts)];
  const clear = Math.max(
    0.3,
    ctx.baseDrop - ctx.center.built.pavilionDepth - ctx.center.built.girdleThickness * 0.5,
  );
  // on the diagonal the stones can overlap along the band a little; never closer than the gap across
  const hc = support(o, ax, az);
  const overlap = Math.min(0.6, shift) * hc * 0.6;
  const q = seatBeside(ctx, s, 1, hc - overlap + gap, off, clear, 0.5);
  metal.push(
    ...basket(ctx, s, q, {
      count: 4,
      style,
      wireMm: opts.wireMm * 0.95,
      rails: [0.3],
      baseScale: 0.45,
    }),
  );
  const r = opts.wireMm * 0.42;
  metal.push(...seatBars(ctx, 0, q.u, r, 0, off * 0.5));

  // Two slim swoops: each rises from the shank on its own side, hugs the outside of one stone under its girdle and
  // runs on past the other stone's seat, so the pair looks embraced.
  const wr = num(p, 'swoopWidth', 0.9, 0.5, 2) / 2;
  const so = cleanOutline(s.built.outline);
  const sPos = v3(0, 0, 0).applyMatrix4(q.m);
  const sU = sPos.x * ax + sPos.z * az;
  const sW = Math.min(support(so, 0, 1), support(so, 0, -1), support(so, 1, 0), support(so, -1, 0));
  const P = (u: number, v: number, y: number) => v3(ax * u + px * v, y, az * u + pz * v);
  const Rs = shankTopRadius(ctx);
  const reach = Math.min(Rs * 0.7, hc + 3);
  const pdC = ctx.center.built.pavilionDepth;
  const pdS = s.built.pavilionDepth;
  // swoop A: leaves the shank on the -band side, hugs the centre stone's far side (v < 0) just under its girdle and
  // runs into the second stone's basket
  const uA0 = -reach;
  const sHalf = support(so, 1, 0);
  metal.push(
    ...wire(
      [
        P(uA0, -off * 0.15, shankY(ctx, uA0) + wr * 0.6),
        P(uA0 * 0.75, -off * 0.3, shankY(ctx, uA0 * 0.75) + wr * 1.6),
        P(-hc * 0.55, -(wc * 0.92 + wr), -pdC * 0.5),
        P(hc * 0.2, -(wc + wr + 0.05), -pdC * 0.32),
        P(hc * 0.85, -(wc * 0.55 + wr), -pdC * 0.6),
        P(sU, off - sW - wr * 0.6, sPos.y - pdS * 0.5),
      ],
      wr,
      64,
      10,
    ),
  );
  // swoop B: the mirror image round the second stone's far side (v > off), into the centre's basket
  const uB0 = Math.max(sU + sHalf + 1.5, Math.min(Rs * 0.75, sU + sHalf + 2.6));
  metal.push(
    ...wire(
      [
        P(uB0, off * 0.85, shankY(ctx, uB0) + wr * 0.6),
        P(sU + (uB0 - sU) * 0.75, off * 0.75, shankY(ctx, sU + (uB0 - sU) * 0.75) + wr * 1.6),
        P(sU + sHalf * 0.55, off + sW * 0.92 + wr, sPos.y - pdS * 0.5),
        P(sU - sHalf * 0.2, off + sW + wr + 0.05, sPos.y - pdS * 0.32),
        P(sU - sHalf * 0.85, off + sW * 0.55 + wr, sPos.y - pdS * 0.6),
        P(0, wc + wr * 0.6, -pdC * 0.5),
      ],
      wr,
      64,
      10,
    ),
  );
  return [
    metalPart(metal, 'bypass head'),
    accentPart([s.built.geometry.clone().applyMatrix4(q.m)], 'bypass stone'),
  ];
}

registerHeadBuilder('three-stone', (ctx) => multiStone(ctx, false));
registerHeadBuilder('five-stone', (ctx) => multiStone(ctx, true));
registerHeadBuilder('toi-et-moi', toiEtMoi);
registerHeadBuilder('bypass-head', bypassHead);
