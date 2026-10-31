/**
 * Shared geometry for wedding-band builders. Everything is in the RING FRAME (see ../types.ts):
 * finger axis +Z, top of the ring +Y (theta = PI/2), the band centred on z = 0, millimetres.
 *
 * A band cross-section is described by a `Section`: an outer (top) radius function and an inner
 * (bottom) radius function of the axial coordinate u in [-W/2, W/2]. `slicePoly` turns any u-range of
 * a section into a closed, counter-clockwise profile for `sweepRing`, so two-tone stripes, inlays,
 * notches and stacked bands all reuse the same shapes.
 */
import * as THREE from 'three';
import type { Params } from '@/models/types';
import type { BandCtx, BuiltStone, Part, PartSlot } from '../types';
import { mergeFlat, sweepRing, toFlat, type ProfilePoint, type SweepOptions } from '../helpers';

export const TAU = Math.PI * 2;
export const TOP = Math.PI / 2;

// ---------------------------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------------------------

export function num(p: Params, key: string, def: number, min = -Infinity, max = Infinity): number {
  const v = p[key];
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  const out = Number.isFinite(n) ? n : def;
  return Math.min(max, Math.max(min, out));
}
export function str<T extends string>(p: Params, key: string, allowed: readonly T[], def: T): T {
  const v = p[key];
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : def;
}
export function bool(p: Params, key: string, def: boolean): boolean {
  const v = p[key];
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return def;
}
export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Effective width / thickness: ctx values clamped to a buildable range; `minWidthMm` / `minThicknessMm` params raise them (men's styles). */
export function dims(ctx: BandCtx): { W: number; T: number; R: number } {
  const minW = num(ctx.params, 'minWidthMm', 0, 0, 12);
  const minT = num(ctx.params, 'minThicknessMm', 0, 0, 4);
  const W = clamp(Math.max(ctx.widthMm, minW), 1.2, 12);
  const T = clamp(Math.max(ctx.thicknessMm, minT), 0.9, 4);
  return { W, T, R: Math.max(4, ctx.innerRadius) };
}

// ---------------------------------------------------------------------------------------------
// Angles and contour
// ---------------------------------------------------------------------------------------------

/** Signed angular distance from the top of the ring, in (-PI, PI]. */
export function fromTop(theta: number): number {
  let d = (theta - TOP) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/** Cosine bump: 1 at the top, 0 beyond halfAngle, smooth (C1) in between. */
export function bump(theta: number, halfAngle: number): number {
  const d = Math.abs(fromTop(theta));
  if (d >= halfAngle) return 0;
  return 0.5 * (1 + Math.cos((Math.PI * d) / halfAngle));
}

export type ZFn = (theta: number) => number;

/** zOffset for a contour band (undefined when there is no contour). */
export function contourZ(ctx: BandCtx): ZFn | undefined {
  const c = ctx.contour;
  if (!c || !(c.retreatMm > 0)) return undefined;
  const half = clamp(c.halfAngle, 0.1, Math.PI * 0.9);
  const amp = c.retreatMm * c.direction;
  return (t) => amp * bump(t, half);
}

/** Largest |zOffset| a band will produce (for tests and placement). */
export function contourRetreat(ctx: BandCtx): number {
  return ctx.contour && ctx.contour.retreatMm > 0 ? ctx.contour.retreatMm : 0;
}

/** Slice count: more when the band bends so the curve stays smooth. */
export function segs(base: number, z?: ZFn): number {
  return z ? Math.round(base * 1.5) : base;
}

// ---------------------------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------------------------

export interface Section {
  /** Full width (u in [-W/2, W/2]). */
  W: number;
  /** Outer surface radius at u. */
  top: (u: number) => number;
  /** Inner surface radius at u. */
  bot: (u: number) => number;
}

export interface ShapeOpts {
  /** Outer dome height (mm) at the centre relative to the edges. */
  dome?: number;
  /** Comfort-fit inner dome (mm): inner edges sit this much further out than the centre. */
  innerDome?: number;
  /** Corner radius (mm) of the outer edges. */
  corner?: number;
  /** Inner corner radius (mm). Default: half the outer corner. */
  innerCorner?: number;
  /** Width of a straight chamfer on the outer edges (mm); 0 = none. */
  bevel?: number;
  /** Ridge: outer surface rises linearly to a peak at u=0 (knife edge), as a fraction of T. */
  ridge?: number;
}

function cornerDrop(u: number, half: number, rad: number): number {
  if (rad <= 0) return 0;
  const x = Math.abs(u) - (half - rad);
  if (x <= 0) return 0;
  const t = Math.min(1, x / rad);
  return rad * (1 - Math.sqrt(Math.max(0, 1 - t * t)));
}

/** Builds a band cross-section of width W and thickness T over inner radius R. Inner radius at u = 0 is exactly R. */
export function makeSection(W: number, T: number, R: number, o: ShapeOpts = {}): Section {
  const half = W / 2;
  const corner = clamp(o.corner ?? 0.3, 0, Math.min(half * 0.95, T * 0.45));
  const innerCorner = clamp(o.innerCorner ?? corner * 0.5, 0, Math.min(half * 0.95, T * 0.3));
  const dome = clamp(o.dome ?? 0, 0, T * 0.6);
  const innerDome = clamp(o.innerDome ?? 0, 0, T * 0.3);
  const bevel = clamp(o.bevel ?? 0, 0, half * 0.6);
  const ridge = clamp(o.ridge ?? 0, 0, 0.7);
  const top = (u: number) => {
    const x = u / half;
    let r = R + T - dome * x * x - cornerDrop(u, half, corner);
    if (bevel > 0) r -= Math.max(0, Math.abs(u) - (half - bevel)) * 0.8;
    if (ridge > 0) {
      const sx = Math.sqrt(x * x + 0.0025) - 0.05; // smoothed |x|, 0 at the ridge
      r -= ridge * T * Math.min(1, sx);
    }
    return r;
  };
  const bot = (u: number) => {
    const x = u / half;
    return R + innerDome * x * x + cornerDrop(u, half, innerCorner);
  };
  return { W, top, bot };
}

/** Offsets a section radially (both surfaces) by a function of u (used for hammered dents etc.). */
export function withTop(s: Section, top: (u: number) => number): Section {
  return { W: s.W, top, bot: s.bot };
}

/**
 * Closed CCW profile of the part of `s` between u = uA and u = uB (n samples per surface, denser near the ends).
 * Points: inner surface left->right, then outer surface right->left.
 */
export function slicePoly(s: Section, uA: number, uB: number, n = 14, uShift = 0): ProfilePoint[] {
  const out: ProfilePoint[] = [];
  const mid = (uA + uB) / 2;
  const h = (uB - uA) / 2;
  const us: number[] = [];
  for (let i = 0; i < n; i++) us.push(mid - h * Math.cos((Math.PI * i) / (n - 1)));
  for (const u of us) out.push([u + uShift, s.bot(u)]);
  for (let i = n - 1; i >= 0; i--) {
    const u = us[i];
    out.push([u + uShift, Math.max(s.top(u), s.bot(u) + 0.05)]);
  }
  return out;
}

/**
 * sweepRing with outward winding: profiles in this folder are CCW in (u, r); sweepRing winds those inward
 * (verified by signed volume), so the point order is reversed before sweeping. Returns non-indexed geometry.
 */
export function sweep(opts: SweepOptions): THREE.BufferGeometry {
  const g = sweepRing({ ...opts, profile: (t) => opts.profile(t).slice().reverse() });
  return toFlat(g);
}

/** Sweeps a section (full width) all the way round. */
export function sweepSection(
  s: Section,
  opts: { z?: ZFn; segments?: number; n?: number; smooth?: boolean } = {},
): THREE.BufferGeometry {
  return sweep({
    segments: opts.segments ?? segs(128, opts.z),
    profile: () => slicePoly(s, -s.W / 2, s.W / 2, opts.n ?? 14),
    zOffset: opts.z,
    smoothProfile: opts.smooth ?? true,
  });
}

// ---------------------------------------------------------------------------------------------
// Placement in the ring frame
// ---------------------------------------------------------------------------------------------

/** Point at angle theta, axial u, radius r (zOffset applied). */
export function ringPt(theta: number, u: number, r: number, z?: ZFn): THREE.Vector3 {
  return new THREE.Vector3(r * Math.cos(theta), r * Math.sin(theta), u + (z ? z(theta) : 0));
}

/**
 * Matrix mapping a local frame onto the ring at (theta, u, r): local +Y -> radial outward, local +X -> along the band
 * (towards decreasing theta, so the frame stays right-handed), local +Z -> +Z (finger axis). Optional spin about local Y.
 */
export function ringFrame(theta: number, u: number, r: number, z?: ZFn, spin = 0): THREE.Matrix4 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const radial = new THREE.Vector3(c, s, 0);
  const along = new THREE.Vector3(s, -c, 0);
  const axis = new THREE.Vector3(0, 0, 1);
  const m = new THREE.Matrix4().makeBasis(along, radial, axis);
  if (spin !== 0) m.multiply(new THREE.Matrix4().makeRotationY(spin));
  const p = ringPt(theta, u, r, z);
  m.setPosition(p);
  return m;
}

/** Instances a geometry at many matrices, non-indexed, keeping only position + normal. */
export function instances(geo: THREE.BufferGeometry, mats: THREE.Matrix4[]): THREE.BufferGeometry[] {
  const base = toFlat(geo);
  return mats.map((m) => {
    const g = base.clone().applyMatrix4(m);
    return g;
  });
}

export function sphere(r: number, detail = 1): THREE.BufferGeometry {
  return toFlat(new THREE.IcosahedronGeometry(r, detail));
}

/** Tapered rod from a to b with a ball on each end (prongs, posts). */
export function rod(
  a: THREE.Vector3,
  b: THREE.Vector3,
  ra: number,
  rb: number,
  radial = 8,
): THREE.BufferGeometry[] {
  const len = a.distanceTo(b);
  if (len < 1e-4) return [sphere(Math.max(ra, rb)).translate(a.x, a.y, a.z)];
  const g = new THREE.CylinderGeometry(rb, ra, len, radial, 1, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()),
  );
  g.translate(a.x, a.y, a.z);
  return [toFlat(g), sphere(ra, 1).translate(a.x, a.y, a.z), sphere(rb, 1).translate(b.x, b.y, b.z)];
}

/** Signed volume of a non-indexed triangle soup (positive = outward winding). */
export function signedVolume(g: THREE.BufferGeometry): number {
  const pos = g.getAttribute('position');
  const idx = g.getIndex();
  const count = idx ? idx.count : pos.count;
  const get = (k: number) => (idx ? idx.getX(k) : k);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let v = 0;
  for (let k = 0; k + 2 < count; k += 3) {
    a.fromBufferAttribute(pos, get(k));
    b.fromBufferAttribute(pos, get(k + 1));
    c.fromBufferAttribute(pos, get(k + 2));
    v += a.dot(b.clone().cross(c)) / 6;
  }
  return v;
}

/** Non-indexed copy that winds outward (flipped if needed) with fresh normals. */
export function outward(g: THREE.BufferGeometry, flatNormals = false): THREE.BufferGeometry {
  const flat = toFlat(g);
  if (signedVolume(flat) < 0) {
    const pos = flat.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let k = 0; k < pos.count; k += 3)
      for (let j = 0; j < 3; j++) {
        const t = arr[(k + 1) * 3 + j];
        arr[(k + 1) * 3 + j] = arr[(k + 2) * 3 + j];
        arr[(k + 2) * 3 + j] = t;
      }
    pos.needsUpdate = true;
    flat.deleteAttribute('normal');
    flat.computeVertexNormals();
  } else if (flatNormals) {
    flat.deleteAttribute('normal');
    flat.computeVertexNormals();
  }
  return flat;
}

/**
 * Hollow cup (bezel) or ring around the local Y axis: annulus from radius ri to ro, y from y0 to y1.
 * `sides` = 4 gives a square frame (rotate 45 deg for a diamond), larger = round.
 */
export function cup(ri: number, ro: number, y0: number, y1: number, sides = 20): THREE.BufferGeometry {
  // Lathe needs radii > 0; the profile is a closed rectangle in (radius, y).
  const pts = [
    new THREE.Vector2(ri, y0),
    new THREE.Vector2(ro, y0),
    new THREE.Vector2(ro, y1),
    new THREE.Vector2(ri, y1),
    new THREE.Vector2(ri, y0),
  ];
  const g = new THREE.LatheGeometry(pts, sides);
  return outward(g, true);
}

// ---------------------------------------------------------------------------------------------
// Stones
// ---------------------------------------------------------------------------------------------

export interface AccentStone {
  built: BuiltStone;
  /** along the band (stone local X) */
  length: number;
  /** across the band (stone local Z) */
  width: number;
}

/** Accent stone whose width across the band is `w`; elongated cuts keep their aspect along the band. */
export function accentStone(ctx: BandCtx, w: number, cutId = ctx.accent.cut.id): AccentStone {
  const cut = ctx.accent.cut;
  const aspect = cut.id === cutId ? clamp(cut.defaultAspect, 1, 3) : 1;
  const depthPct = cut.id === cutId ? clamp(cut.defaultDepthPct, 0.3, 0.9) : 0.61;
  const length = w * aspect;
  const built = ctx.stone(cutId, { length, width: w, depth: depthPct * w }, { detail: 'low' });
  return { built, length, width: w };
}

/** Evenly spaced angles over an arc [a0, a1] at pitch (mm) on radius r. Full circles do not repeat the end. */
export function stations(a0: number, a1: number, r: number, pitch: number): number[] {
  const span = a1 - a0;
  const full = Math.abs(span - TAU) < 1e-6;
  const arc = Math.abs(span) * r;
  if (full) {
    const n = Math.max(3, Math.floor(arc / pitch));
    return Array.from({ length: n }, (_, i) => a0 + (span * (i + 0.5)) / n);
  }
  const n = Math.max(1, Math.floor(arc / pitch));
  return Array.from({ length: n }, (_, i) => a0 + (span * (i + 0.5)) / n);
}

export type Coverage = 'half' | 'three-quarter' | 'full';
export const COVERAGES = ['half', 'three-quarter', 'full'] as const;

/** Arc for a coverage, centred on the top of the ring. */
export function coverageArc(c: Coverage): [number, number] {
  if (c === 'full') return [TOP - Math.PI, TOP + Math.PI];
  const span = c === 'half' ? Math.PI : Math.PI * 1.5;
  return [TOP - span / 2, TOP + span / 2];
}

/** 1 inside the arc, 0 outside, with smooth ramps of `ramp` radians (for grooves that end inside the band). */
export function arcMask(theta: number, arc: [number, number], ramp = 0.08): number {
  const span = arc[1] - arc[0];
  if (span >= TAU - 1e-6) return 1;
  const d = Math.abs(fromTop(theta));
  const half = span / 2;
  return 1 - smoothstep(half - ramp, half + ramp * 0.25, d);
}

// ---------------------------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------------------------

export function part(slot: PartSlot, geos: THREE.BufferGeometry[], label: string): Part {
  return { slot, geometry: mergeFlat(geos), label };
}

/** Drops empty geometry lists. */
export function parts(...ps: (Part | null)[]): Part[] {
  return ps.filter(
    (p): p is Part =>
      !!p &&
      p.geometry.getAttribute('position') !== undefined &&
      p.geometry.getAttribute('position').count > 0,
  );
}

/** Milgrain: a row of tiny beads along the band at axial position u (follows the outer surface). */
export function milgrainRow(
  s: Section,
  u: number,
  beadR: number,
  z?: ZFn,
  arc: [number, number] = [0, TAU],
): THREE.BufferGeometry[] {
  const r = s.top(u) - beadR * 0.35;
  const angles = stations(arc[0], arc[1], r, beadR * 2.05);
  const bead = toFlat(new THREE.SphereGeometry(beadR, 7, 4)); // ~42 triangles: beads are tiny
  return instances(
    bead,
    angles.map((t) => ringFrame(t, u, r, z)),
  );
}

/** Deterministic hash in [0, 1) for integer cells (no Math.random). */
export function hash2(i: number, j: number, seed = 0): number {
  let h = (i * 374761393 + j * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) % 100000) / 100000;
}
