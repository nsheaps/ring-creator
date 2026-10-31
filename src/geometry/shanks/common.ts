/**
 * Shared geometry for shank builders. Everything here works in the RING FRAME (see ../types.ts):
 * finger axis +Z, top of the ring +Y (theta = PI/2), millimetres.
 *
 * Param conventions shared by every shank (all optional, each builder documents its own defaults):
 *   thicknessMm     radial thickness at the bottom of the ring
 *   topThicknessMm  radial thickness at the top (under the head)
 *   widthMm         axial width (along the finger) at the bottom
 *   topWidthMm      axial width at the top
 *   taperDeg        angle either side of the top over which bottom dimensions blend into top dimensions
 *   roundness       0 = flat top with crisp shoulders, 1 = fully domed outer surface
 */
import * as THREE from 'three';
import type { Params } from '@/models/types';
import type { Part, ShankCtx } from '../types';
import { instanceGeometry, mergeFlat, sweepRing, toFlat, type ProfilePoint } from '../helpers';

export const TOP = Math.PI / 2;
export const TAU = Math.PI * 2;

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

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
/** Angular distance from the top (0..PI). */
export function fromTop(theta: number): number {
  let d = (theta - TOP) % TAU;
  if (d < 0) d += TAU;
  return d > Math.PI ? TAU - d : d;
}
/** Signed angle from the top in (-PI, PI]; positive towards -X (increasing theta). */
export function signedFromTop(theta: number): number {
  let d = (theta - TOP) % TAU;
  if (d <= -Math.PI) d += TAU;
  if (d > Math.PI) d -= TAU;
  return d;
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// Taper: bottom dimensions blend into top dimensions near the head
// ---------------------------------------------------------------------------------------------

export interface Taper {
  wBottom: number;
  wTop: number;
  tBottom: number;
  tTop: number;
  /** radians either side of the top */
  span: number;
}

export function readTaper(
  p: Params,
  d: { w: number; wTop: number; t: number; tTop: number; taperDeg: number },
): Taper {
  return {
    wBottom: num(p, 'widthMm', d.w, 0.8, 8),
    wTop: num(p, 'topWidthMm', d.wTop, 0.8, 8),
    tBottom: num(p, 'thicknessMm', d.t, 0.8, 4),
    tTop: num(p, 'topThicknessMm', d.tTop, 0.8, 4),
    span: (num(p, 'taperDeg', d.taperDeg, 10, 180) * Math.PI) / 180,
  };
}

/** 0 at (and beyond) the taper span, 1 at the top. */
export function topness(theta: number, span: number): number {
  return smooth(1 - fromTop(theta) / span);
}
export function widthAt(tp: Taper, theta: number): number {
  return tp.wBottom + (tp.wTop - tp.wBottom) * topness(theta, tp.span);
}
export function thickAt(tp: Taper, theta: number): number {
  return tp.tBottom + (tp.tTop - tp.tBottom) * topness(theta, tp.span);
}

// ---------------------------------------------------------------------------------------------
// Cross sections
// ---------------------------------------------------------------------------------------------

export interface SectionSpec {
  /** axial width */
  w: number;
  /** radial thickness */
  t: number;
  /** inner radius: the lowest point of the section sits exactly here */
  R: number;
  /** superellipse exponent of the outer half: 1 = ridge (knife edge), 2 = ellipse dome, 6+ = flat top */
  outerExp: number;
  /** superellipse exponent of the inner half: 2 = domed (comfort fit), 8 = flat inside */
  innerExp: number;
  /** fraction of the thickness taken by the outer half (0.3..0.8) */
  split: number;
  /** axial centre */
  u0?: number;
  /** point count, multiple of 4 */
  n?: number;
}

/**
 * Two-half superellipse section. Counter-clockwise in (u right, r up), as sweepRing expects.
 * Point n*3/4 is exactly at (u0, R), so the finger hole is exact.
 */
export function bandSection(s: SectionSpec): ProfilePoint[] {
  const n = s.n ?? 24;
  const u0 = s.u0 ?? 0;
  const hTop = s.t * s.split;
  const hBot = s.t - hTop;
  const rMid = s.R + hBot;
  const out: ProfilePoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const top = sn >= 0;
    const e = top ? s.outerExp : s.innerExp;
    const h = top ? hTop : hBot;
    const px = (s.w / 2) * Math.sign(c) * Math.abs(c) ** (2 / e);
    const py = h * Math.sign(sn) * Math.abs(sn) ** (2 / e);
    out.push([u0 + px, rMid + py]);
  }
  return out;
}

/** A small circle section centred at (u, r). */
export function circleSection(u: number, r: number, radius: number, n = 12, ru = radius): ProfilePoint[] {
  const out: ProfilePoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    out.push([u + ru * Math.cos(a), r + radius * Math.sin(a)]);
  }
  return out;
}

/** Shift a section radially so its lowest point is exactly at R. */
export function pinInner(sec: ProfilePoint[], R: number): ProfilePoint[] {
  let m = Infinity;
  for (const p of sec) m = Math.min(m, p[1]);
  const d = R - m;
  return sec.map((p) => [p[0], p[1] + d]);
}

/** Exponent for a "roundness" control: 1 -> elliptical dome, 0 -> flat top. */
export function outerExpFromRoundness(roundness: number): number {
  return 2 + (1 - clamp(roundness, 0, 1)) * 6;
}

// ---------------------------------------------------------------------------------------------
// Geometry utilities
// ---------------------------------------------------------------------------------------------

/** Signed volume of a triangle soup (positive when faces wind outward). */
export function signedVolume(g: THREE.BufferGeometry): number {
  const pos = g.getAttribute('position');
  const idx = g.getIndex();
  const count = idx ? idx.count : pos.count;
  const get = (k: number) => (idx ? idx.getX(k) : k);
  let v = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const t = new THREE.Vector3();
  for (let k = 0; k + 2 < count; k += 3) {
    a.fromBufferAttribute(pos, get(k));
    b.fromBufferAttribute(pos, get(k + 1));
    c.fromBufferAttribute(pos, get(k + 2));
    v += a.dot(t.copy(b).cross(c)) / 6;
  }
  return v;
}

/**
 * Make a closed indexed mesh wind outward (flip if its signed volume is negative), recompute smooth normals,
 * then return a non-indexed copy with position + normal only.
 */
export function finish(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (signedVolume(g) < 0) {
    const idx = g.getIndex();
    if (idx) {
      const arr = idx.array as Uint16Array | Uint32Array;
      for (let k = 0; k + 2 < arr.length; k += 3) {
        const t = arr[k + 1];
        arr[k + 1] = arr[k + 2];
        arr[k + 2] = t;
      }
      idx.needsUpdate = true;
    } else {
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let k = 0; k < pos.count; k += 3)
        for (let j = 0; j < 3; j++) {
          const t = arr[(k + 1) * 3 + j];
          arr[(k + 1) * 3 + j] = arr[(k + 2) * 3 + j];
          arr[(k + 2) * 3 + j] = t;
        }
      pos.needsUpdate = true;
    }
  }
  if (g.getAttribute('normal')) g.deleteAttribute('normal');
  g.computeVertexNormals();
  const flat = toFlat(g);
  g.dispose();
  return flat;
}

/** Non-indexed with per-face normals (faceted metal, e.g. hammered facets). */
export function facet(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const f = finish(g);
  f.deleteAttribute('normal');
  f.computeVertexNormals(); // non-indexed: per-face normals
  return f;
}

export interface SweepArgs {
  profile: (theta: number) => ProfilePoint[];
  segments?: number;
  thetaStart?: number;
  thetaEnd?: number;
  zOffset?: (theta: number) => number;
  smoothProfile?: boolean;
}
/** sweepRing + outward winding + flat output. */
export function sweep(a: SweepArgs): THREE.BufferGeometry {
  return finish(sweepRing({ smoothProfile: true, segments: 160, ...a }));
}

/** A plain tapered band with a two-half superellipse section. */
export function taperedBand(
  R: number,
  tp: Taper,
  sec: {
    outerExp: number;
    innerExp: number;
    split: number;
    n?: number;
    smoothProfile?: boolean;
    segments?: number;
  },
): THREE.BufferGeometry {
  return sweep({
    segments: sec.segments ?? 160,
    smoothProfile: sec.smoothProfile ?? true,
    profile: (th) =>
      bandSection({
        w: widthAt(tp, th),
        t: thickAt(tp, th),
        R,
        outerExp: sec.outerExp,
        innerExp: sec.innerExp,
        split: sec.split,
        n: sec.n,
      }),
  });
}

/** Low-poly sphere, non-indexed. */
export function beadGeometry(radius: number, ws = 8, hs = 5): THREE.BufferGeometry {
  return toFlat(new THREE.SphereGeometry(radius, ws, hs));
}

/** Point on the ring at angle theta, radius r, axial z. */
export function ringPoint(theta: number, r: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(r * Math.cos(theta), r * Math.sin(theta), z);
}

/**
 * Local frame at angle theta: X = band tangent (direction of increasing theta), Y = radial outward, Z = finger axis.
 * Placing a stone-frame object (table +Y, length +X) with this matrix lays it flat on the band, table outward.
 */
export function ringFrame(theta: number, r: number, z: number, spinY = 0): THREE.Matrix4 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const tx = new THREE.Vector3(-s, c, 0);
  const ry = new THREE.Vector3(c, s, 0);
  const zz = new THREE.Vector3(0, 0, 1);
  const m = new THREE.Matrix4().makeBasis(tx, ry, zz);
  m.setPosition(r * c, r * s, z);
  if (spinY !== 0) m.multiply(new THREE.Matrix4().makeRotationY(spinY));
  return m;
}

export function instances(geo: THREE.BufferGeometry, ms: THREE.Matrix4[]): THREE.BufferGeometry {
  return toFlat(instanceGeometry(geo, ms));
}

/** Angles of n evenly spaced items, centred on the zone [a0, a1] (radians), each `pitch` apart along an arc of radius r. */
export function spacedAngles(a0: number, a1: number, r: number, pitch: number): number[] {
  const len = (a1 - a0) * r;
  const count = Math.max(0, Math.floor(len / pitch));
  if (count === 0) return [];
  const step = pitch / r;
  const used = (count - 1) * step;
  const start = (a0 + a1) / 2 - used / 2;
  return Array.from({ length: count }, (_, i) => start + i * step);
}

/**
 * Sweep a closed 2D section along an open 3D polyline (smooth around the section, flat end caps).
 * frame(i) gives the section's u and v axes at point i; section(i) gives [u, v] points (convex, same count each time).
 */
export function tube(
  path: THREE.Vector3[],
  frame: (i: number) => [THREE.Vector3, THREE.Vector3],
  section: (i: number) => [number, number][],
): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const m = section(0).length;
  const ring = (i: number) => {
    const [U, V] = frame(i);
    const p = path[i];
    return section(i).map(([u, v]) =>
      new THREE.Vector3().copy(p).addScaledVector(U, u).addScaledVector(V, v),
    );
  };
  const rings = path.map((_, i) => ring(i));
  for (const r of rings) for (const v of r) pos.push(v.x, v.y, v.z);
  // wall winding: outward means the first quad's normal points away from the path
  const n0 = new THREE.Vector3()
    .subVectors(rings[1][0], rings[0][0])
    .cross(new THREE.Vector3().subVectors(rings[0][1 % m], rings[0][0]));
  const mid = new THREE.Vector3()
    .addVectors(rings[0][0], rings[0][1 % m])
    .multiplyScalar(0.5)
    .sub(path[0]);
  const wallFlip = n0.dot(mid) < 0;
  for (let i = 0; i + 1 < rings.length; i++)
    for (let k = 0; k < m; k++) {
      const k1 = (k + 1) % m;
      const a = i * m + k;
      const b = i * m + k1;
      const c = (i + 1) * m + k;
      const d = (i + 1) * m + k1;
      if (wallFlip) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  const cap = (r: THREE.Vector3[], outward: THREE.Vector3) => {
    const base = pos.length / 3;
    for (const v of r) pos.push(v.x, v.y, v.z);
    const nrm = new THREE.Vector3().subVectors(r[1], r[0]).cross(new THREE.Vector3().subVectors(r[2], r[0]));
    const flip = nrm.dot(outward) < 0;
    for (let k = 1; k < m - 1; k++) {
      if (flip) idx.push(base, base + k + 1, base + k);
      else idx.push(base, base + k, base + k + 1);
    }
  };
  const last = path.length - 1;
  cap(rings[0], new THREE.Vector3().subVectors(path[0], path[1]));
  cap(rings[last], new THREE.Vector3().subVectors(path[last], path[last - 1]));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** A frame for curves lying in planes containing Z: U = Z, V = in-plane normal (Z x tangent). */
export function planarFrames(path: THREE.Vector3[]): (i: number) => [THREE.Vector3, THREE.Vector3] {
  const Z = new THREE.Vector3(0, 0, 1);
  return (i) => {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(path.length - 1, i + 1)];
    const t = new THREE.Vector3().subVectors(b, a);
    t.z = 0;
    t.normalize();
    const v = new THREE.Vector3().crossVectors(Z, t).normalize();
    return [Z.clone(), v];
  };
}

export function cubic(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  p3: THREE.Vector3,
  n: number,
): THREE.Vector3[] {
  const curve = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
  return curve.getPoints(n);
}

export function metal(geos: THREE.BufferGeometry[], label: string): Part {
  const live = geos.filter((g) => (g.getAttribute('position')?.count ?? 0) > 0);
  return { slot: 'shank-metal', geometry: live.length === 1 ? live[0] : mergeFlat(live), label };
}

/** Accent stone dims for pave / channel stones: sizeMm along the band, width from the cut's aspect. */
export function accentDims(ctx: ShankCtx, size: number): { length: number; width: number; depth: number } {
  const aspect = clamp(ctx.accent.cut.defaultAspect || 1, 1, 4);
  const width = size / aspect;
  return { length: size, width, depth: width * clamp(ctx.accent.cut.defaultDepthPct || 0.6, 0.3, 1) };
}

/** Accent size from a `stoneSizeMm` param (0 = use the design's accent stone size). */
export function accentSize(ctx: ShankCtx, p: Params, min: number, max: number): number {
  const v = num(p, 'stoneSizeMm', 0, 0, 5);
  return clamp(v > 0 ? v : ctx.accent.sizeMm || 1.3, min, max);
}

/** Half angle (radians) the head occupies at radius r. */
export function headHalfAngle(ctx: ShankCtx, r: number): number {
  return Math.min(Math.PI * 0.45, (ctx.headHalfAlongBand || 3) / r);
}

/** Milgrain: a row of tiny beads at radius r, axial z, from angle a0 to a1 (radians). */
export function beadRow(
  r: number,
  z: number,
  beadR: number,
  a0: number,
  a1: number,
  pitch = beadR * 2.3,
): THREE.Matrix4[] {
  return spacedAngles(a0, a1, r, pitch).map((th) =>
    new THREE.Matrix4().makeTranslation(r * Math.cos(th), r * Math.sin(th), z),
  );
}
