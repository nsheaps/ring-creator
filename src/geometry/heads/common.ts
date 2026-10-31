/**
 * Shared geometry for head builders. Everything here works in the STONE FRAME:
 * girdle plane y = 0, table towards +Y, outline in the (x, z) plane, millimetres.
 */
import * as THREE from 'three';
import type { Params } from '@/models/types';
import type { BuiltStone, HeadCtx, Outline, Part } from '../types';
import { instanceGeometry, mergeFlat, toFlat } from '../helpers';

// ---------------------------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------------------------

export function num(p: Params, key: string, def: number, min = -Infinity, max = Infinity): number {
  const v = p[key];
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
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

export const PRONG_STYLES = ['round', 'claw', 'tab', 'v'] as const;
export type ProngStyle = (typeof PRONG_STYLES)[number];

// ---------------------------------------------------------------------------------------------
// 2D outline maths
// ---------------------------------------------------------------------------------------------

export type V2 = [number, number];

/** A point on a closed path with its outward unit normal and unit tangent (direction of travel). */
export interface PathPt {
  x: number;
  z: number;
  nx: number;
  nz: number;
  tx: number;
  tz: number;
}

function signedArea(pts: V2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % pts.length];
    a += x0 * z1 - x1 * z0;
  }
  return a / 2;
}

/** A cleaned outline: positive signed area in (x,z), no duplicate points, corners remapped. */
export interface CleanOutline {
  pts: V2[];
  corners: number[];
  /** cumulative arc length at each vertex (cum[0] = 0) */
  cum: number[];
  perimeter: number;
}

export function cleanOutline(o: Outline): CleanOutline {
  let pts: V2[] = [];
  const map: number[] = [];
  for (let i = 0; i < o.points.length; i++) {
    const p = o.points[i];
    const last = pts[pts.length - 1];
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 1e-5) {
      map[i] = pts.length - 1;
      continue;
    }
    map[i] = pts.length;
    pts.push([p[0], p[1]]);
  }
  if (pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-5) {
    pts.pop();
    for (let i = 0; i < map.length; i++) if (map[i] === pts.length) map[i] = 0;
  }
  if (pts.length < 3) {
    // Degenerate input: fall back to a tiny circle so builders never crash.
    pts = circlePoints(1, 1, 24);
    return withArc(pts, []);
  }
  let corners = [...new Set(o.corners.filter((c) => c >= 0 && c < o.points.length).map((c) => map[c]))];
  if (signedArea(pts) < 0) {
    const n = pts.length;
    pts = pts.slice().reverse();
    corners = corners.map((c) => n - 1 - c);
  }
  corners.sort((a, b) => a - b);
  return withArc(pts, corners);
}

function withArc(pts: V2[], corners: number[]): CleanOutline {
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const n = pts.length;
  const perimeter = cum[n - 1] + Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]);
  return { pts, corners, cum, perimeter };
}

export function circlePoints(rx: number, rz: number, n: number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([rx * Math.cos(a), rz * Math.sin(a)]);
  }
  return out;
}

function edgeNormal(a: V2, b: V2): V2 {
  // For a positive-area (CCW in x,z) polygon the outward normal of edge a->b is (dz, -dx).
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l = Math.hypot(dx, dz) || 1;
  return [dz / l, -dx / l];
}

function norm2(v: V2): V2 {
  const l = Math.hypot(v[0], v[1]);
  return l > 1e-9 ? [v[0] / l, v[1] / l] : [1, 0];
}

/** Point at arc length s (wraps). The normal at a vertex is the bisector of its edges. */
export function pointAt(o: CleanOutline, s: number): PathPt {
  const P = o.perimeter;
  let t = ((s % P) + P) % P;
  const n = o.pts.length;
  let i = 0;
  // binary search for the segment
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (o.cum[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  i = lo;
  const a = o.pts[i];
  const b = o.pts[(i + 1) % n];
  const segLen = (i === n - 1 ? P : o.cum[i + 1]) - o.cum[i];
  t -= o.cum[i];
  const f = segLen > 1e-9 ? t / segLen : 0;
  const en = edgeNormal(a, b);
  let nrm: V2 = en;
  if (f < 1e-6) nrm = vertexNormal(o, i);
  else if (f > 1 - 1e-6) nrm = vertexNormal(o, (i + 1) % n);
  const tan: V2 = [-nrm[1], nrm[0]];
  return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, nx: nrm[0], nz: nrm[1], tx: tan[0], tz: tan[1] };
}

export function vertexNormal(o: CleanOutline, i: number): V2 {
  const n = o.pts.length;
  const prev = o.pts[(i - 1 + n) % n];
  const cur = o.pts[i];
  const next = o.pts[(i + 1) % n];
  const n0 = edgeNormal(prev, cur);
  const n1 = edgeNormal(cur, next);
  return norm2([n0[0] + n1[0], n0[1] + n1[1]]);
}

/** Arc length of the outline point hit by a ray from the origin in direction (dx, dz). */
export function arcAtDirection(o: CleanOutline, dx: number, dz: number): number {
  const n = o.pts.length;
  let best = -1;
  let bestS = 0;
  for (let i = 0; i < n; i++) {
    const a = o.pts[i];
    const b = o.pts[(i + 1) % n];
    // solve a + (b-a) u = d t  (t > 0, 0<=u<=1)
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const det = ex * -dz - ez * -dx;
    if (Math.abs(det) < 1e-12) continue;
    const u = (-a[0] * -dz - -a[1] * -dx) / det;
    const t = (ex * -a[1] - ez * -a[0]) / det;
    if (u >= -1e-9 && u <= 1 + 1e-9 && t > 0 && (best < 0 || t > best)) {
      best = t;
      const segLen = Math.hypot(ex, ez);
      bestS = o.cum[i] + Math.min(1, Math.max(0, u)) * segLen;
    }
  }
  return bestS;
}

/** Support distance of the outline in direction (dx,dz): max over points of p.d */
export function support(o: CleanOutline, dx: number, dz: number): number {
  let m = 0;
  for (const p of o.pts) m = Math.max(m, p[0] * dx + p[1] * dz);
  return m;
}

export function meanRadius(o: CleanOutline): number {
  let s = 0;
  for (const p of o.pts) s += Math.hypot(p[0], p[1]);
  return s / o.pts.length;
}

/** Evenly resampled closed path (by arc length) with smoothed outward normals. */
export function resample(o: CleanOutline, count: number, smooth = 2): PathPt[] {
  const out: PathPt[] = [];
  for (let i = 0; i < count; i++) out.push(pointAt(o, (i / count) * o.perimeter));
  // Smooth the normals (corners become rounded when offset).
  for (let k = 0; k < smooth; k++) {
    const ns = out.map((p, i) => {
      const a = out[(i - 1 + count) % count];
      const b = out[(i + 1) % count];
      return norm2([a.nx + 2 * p.nx + b.nx, a.nz + 2 * p.nz + b.nz]);
    });
    out.forEach((p, i) => {
      p.nx = ns[i][0];
      p.nz = ns[i][1];
      p.tx = -p.nz;
      p.tz = p.nx;
    });
  }
  return out;
}

/** Offset a closed path along its normals and return it as a clean outline (for arc-length placement). */
export function offsetOutline(o: CleanOutline, gap: number, samples = 96): CleanOutline {
  const path = resample(o, samples, 3);
  const pts: V2[] = path.map((p) => [p.x + p.nx * gap, p.z + p.nz * gap]);
  return withArc(fixOrientation(pts), []);
}

function fixOrientation(pts: V2[]): V2[] {
  return signedArea(pts) < 0 ? pts.slice().reverse() : pts;
}

/** Uniformly scaled copy of an outline (about the origin). */
export function scaleOutline(o: CleanOutline, sx: number, sz = sx): CleanOutline {
  const pts: V2[] = o.pts.map((p) => [p[0] * sx, p[1] * sz]);
  return withArc(pts, o.corners.slice());
}

/** A superellipse (exponent e: 2 ellipse, 4 cushion-like) that encloses the outline offset by gap. */
export function templateOutline(o: CleanOutline, shape: 'round' | 'cushion' | 'oval', gap: number, ovalAspect = 1.25, samples = 96): CleanOutline {
  const hx = support(o, 1, 0) * 0.5 + support(o, -1, 0) * 0.5;
  const hz = support(o, 0, 1) * 0.5 + support(o, 0, -1) * 0.5;
  let ax: number;
  let az: number;
  let e = 2;
  if (shape === 'round') {
    ax = az = Math.max(hx, hz);
  } else if (shape === 'oval') {
    ax = hx;
    az = hz;
    if (ax / az < ovalAspect) ax = az * ovalAspect;
  } else {
    ax = hx;
    az = hz;
    e = 4;
  }
  const make = (k: number): V2[] => {
    const out: V2[] = [];
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      out.push([k * ax * Math.sign(c) * Math.abs(c) ** (2 / e), k * az * Math.sign(s) * Math.abs(s) ** (2 / e)]);
    }
    return out;
  };
  // Grow until every outline point (plus gap) fits inside: check radial distances.
  const base = make(1);
  const baseOutline = withArc(base, []);
  let k = 1;
  for (const p of o.pts) {
    const r = Math.hypot(p[0], p[1]);
    if (r < 1e-6) continue;
    const s = arcAtDirection(baseOutline, p[0] / r, p[1] / r);
    const q = pointAt(baseOutline, s);
    const rt = Math.hypot(q.x, q.z);
    if (rt > 1e-6) k = Math.max(k, (r + gap) / rt);
  }
  return withArc(make(k), []);
}

// ---------------------------------------------------------------------------------------------
// 3D primitives
// ---------------------------------------------------------------------------------------------

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Drop consecutive near-duplicate points (they make TubeGeometry produce NaN frames). */
function dedupe(points: THREE.Vector3[], eps = 1e-3): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const p of points) if (!out.length || out[out.length - 1].distanceTo(p) > eps) out.push(p);
  return out;
}

/** Smooth open wire through points, with sphere caps at both ends. */
export function wire(points: THREE.Vector3[], radius: number, segs = 20, radial = 8, capEnds = true): THREE.BufferGeometry[] {
  const pts = dedupe(points);
  const out: THREE.BufferGeometry[] = [];
  if (pts.length < 2) return out;
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  out.push(toFlat(new THREE.TubeGeometry(curve, segs, radius, radial, false)));
  if (capEnds) {
    out.push(ball(pts[0], radius, 1));
    out.push(ball(pts[pts.length - 1], radius, 1));
  }
  return out;
}

/** Closed smooth loop wire through points. */
export function loop(points: THREE.Vector3[], radius: number, segs = 64, radial = 8): THREE.BufferGeometry {
  const pts = dedupe(points);
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  return toFlat(new THREE.TubeGeometry(curve, segs, radius, radial, true));
}

export function ball(c: THREE.Vector3, r: number, detail = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  g.translate(c.x, c.y, c.z);
  return toFlat(g);
}

/** Box with given size, centred at c, axes = (ax, ay, az) (orthonormal). */
export function orientedBox(c: THREE.Vector3, size: [number, number, number], ax: THREE.Vector3, ay: THREE.Vector3, az: THREE.Vector3): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const m = new THREE.Matrix4().makeBasis(ax, ay, az).setPosition(c);
  g.applyMatrix4(m);
  return toFlat(g);
}

/** Tapered rod between a and b with ball ends. */
export function rod(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, radial = 8): THREE.BufferGeometry[] {
  if (a.distanceTo(b) < 1e-4) return [ball(a, Math.max(ra, rb), 1)];
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(rb, ra, len, radial, 1, true);
  g.translate(0, len / 2, 0);
  const dir = b.clone().sub(a).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), dir));
  g.translate(a.x, a.y, a.z);
  const out = [toFlat(g), ball(a, ra, 1)];
  if (rb > 0.05) out.push(ball(b, rb, 1));
  return out;
}

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
  for (let k = 0; k + 2 < count; k += 3) {
    a.fromBufferAttribute(pos, get(k));
    b.fromBufferAttribute(pos, get(k + 1));
    c.fromBufferAttribute(pos, get(k + 2));
    v += a.dot(b.clone().cross(c)) / 6;
  }
  return v;
}

/** Make a closed mesh wind outward (flip if its signed volume is negative), non-indexed with normals. */
export function ensureOutward(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g;
  if (signedVolume(flat) < 0) {
    const pos = flat.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let k = 0; k < pos.count; k += 3) {
      for (let j = 0; j < 3; j++) {
        const t = arr[(k + 1) * 3 + j];
        arr[(k + 1) * 3 + j] = arr[(k + 2) * 3 + j];
        arr[(k + 2) * 3 + j] = t;
      }
    }
    pos.needsUpdate = true;
  }
  flat.deleteAttribute('normal');
  flat.computeVertexNormals();
  return toFlat(flat);
}

/**
 * Loft a 2D section along a path in the xz plane. Section points are [offset along the path's outward normal, y].
 * The section is closed. Closed paths make a closed ring; open paths get flat end caps. Output winds outward.
 */
export type SectionPt = [number, number] | [number, number, number];
export function loft(path: PathPt[], section: SectionPt[], closed = true): THREE.BufferGeometry {
  const pos: number[] = [];
  const m = section.length;
  // [offset, y, scale?]: the path point is first scaled about the origin, then offset along its normal.
  const vert = (p: PathPt, s: SectionPt) => {
    const k = s.length === 3 ? s[2] : 1;
    return [p.x * k + p.nx * s[0], s[1], p.z * k + p.nz * s[0]];
  };
  const segs = closed ? path.length : path.length - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = path[i];
    const p1 = path[(i + 1) % path.length];
    for (let k = 0; k < m; k++) {
      const a = vert(p0, section[k]);
      const b = vert(p0, section[(k + 1) % m]);
      const c = vert(p1, section[k]);
      const d = vert(p1, section[(k + 1) % m]);
      pos.push(...a, ...c, ...b, ...b, ...c, ...d);
    }
  }
  if (!closed) {
    const cap = (p: PathPt, flip: boolean) => {
      const cx = section.reduce((s, q) => s + q[0], 0) / m;
      const cy = section.reduce((s, q) => s + q[1], 0) / m;
      const ck = section.reduce((s, q) => s + (q.length === 3 ? q[2] : 1), 0) / m;
      const c = vert(p, [cx, cy, ck]);
      for (let k = 0; k < m; k++) {
        const a = vert(p, section[k]);
        const b = vert(p, section[(k + 1) % m]);
        if (flip) pos.push(...c, ...b, ...a);
        else pos.push(...c, ...a, ...b);
      }
    };
    cap(path[0], false);
    cap(path[path.length - 1], true);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return ensureOutward(g);
}

// ---------------------------------------------------------------------------------------------
// Prongs
// ---------------------------------------------------------------------------------------------

export interface ProngSiteOpts {
  count: number;
  /** Fraction of the spacing to rotate the first prong away from the +X (length) axis when no corners are used. */
  phase?: number;
  /** Use corners (if any) as the first sites. */
  useCorners?: boolean;
}

/** Arc-length positions for prongs: corners first (if wanted), the rest evenly in the gaps (largest remainder). */
export function prongSites(o: CleanOutline, opts: ProngSiteOpts): number[] {
  const count = Math.max(1, Math.round(opts.count));
  const P = o.perimeter;
  const corners = opts.useCorners === false ? [] : o.corners.map((c) => o.cum[c]);
  if (corners.length === 0) {
    const start = arcAtDirection(o, 1, 0) + ((opts.phase ?? 0.5) * P) / count;
    return Array.from({ length: count }, (_, i) => start + (i * P) / count).map((s) => ((s % P) + P) % P);
  }
  if (count <= corners.length) {
    const out: number[] = [];
    const step = corners.length / count;
    for (let i = 0; i < count; i++) out.push(corners[Math.floor(i * step + 1e-9)]);
    return out;
  }
  const extra = count - corners.length;
  const gaps = corners.map((c, i) => {
    const next = i + 1 < corners.length ? corners[i + 1] : corners[0] + P;
    return { start: c, len: next - c, n: 0, rem: 0 };
  });
  const total = gaps.reduce((s, g) => s + g.len, 0);
  let given = 0;
  for (const g of gaps) {
    const ideal = (extra * g.len) / total;
    g.n = Math.floor(ideal);
    g.rem = ideal - g.n;
    given += g.n;
  }
  const order = gaps.map((g, i) => ({ i, r: g.rem })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; k < extra - given; k++) gaps[order[k % order.length].i].n++;
  const out: number[] = [];
  for (const g of gaps) {
    out.push(g.start);
    for (let j = 1; j <= g.n; j++) out.push(g.start + (g.len * j) / (g.n + 1));
  }
  return out.map((s) => ((s % P) + P) % P);
}

export interface ProngSetOpts {
  count: number;
  style: ProngStyle;
  /** wire diameter, mm */
  wireMm: number;
  /** y of the seat (bottom of the head) in this stone's frame (negative). */
  baseY: number;
  /** base footprint as a fraction of the outline (0.2..0.9) */
  baseScale: number;
  phase?: number;
  useCorners?: boolean;
  /** gallery rails at these fractions of the pavilion depth (0 = girdle, 1 = culet). */
  rails?: number[];
  /** Each prong is two wires side by side (double claw). */
  double?: boolean;
  /** Prongs split into two tips just below the girdle. */
  split?: boolean;
  /** Prongs cross over their neighbours (trellis). */
  trellis?: boolean;
  /** Seat ring at the base. Default true. */
  seat?: boolean;
  /** Explicit arc-length sites (overrides count/phase). */
  sites?: number[];
}

/** Height of the crown surface at an inward distance d from the girdle edge (approximate). */
function crownY(stone: BuiltStone, o: CleanOutline, d: number): number {
  const half = Math.min(support(o, 1, 0), support(o, 0, 1));
  const crownRun = Math.max(0.3, half * 0.42); // girdle edge to table edge, horizontally
  return stone.crownHeight * Math.min(1, Math.max(0, d) / crownRun) + stone.girdleThickness * 0.5;
}

/**
 * A full prong setting (prongs, optional rails, seat ring) for one stone, in that stone's frame.
 * Returns flat geometries ready for mergeFlat.
 */
export function prongSet(stone: BuiltStone, opts: ProngSetOpts): THREE.BufferGeometry[] {
  const o = cleanOutline(stone.outline);
  const r = Math.max(0.2, opts.wireMm / 2);
  const pd = Math.max(0.1, stone.pavilionDepth);
  const gt = Math.max(0, stone.girdleThickness);
  const baseY = Math.min(-0.05, opts.baseY);
  const depthBelow = -baseY;
  const sites = opts.sites ?? prongSites(o, { count: opts.count, phase: opts.phase, useCorners: opts.useCorners });
  const out: THREE.BufferGeometry[] = [];
  const bs = Math.min(0.95, Math.max(0.12, opts.baseScale));
  const scaleAt = (y: number) => Math.max(bs, 1 - Math.min(1, -y / pd)); // pavilion cross-section scale
  // Pavilion waypoint height.
  const yMid = -Math.min(0.55 * pd, 0.6 * depthBelow);
  const sMid = Math.max(scaleAt(yMid), bs);
  const half = Math.min(support(o, 1, 0), support(o, 0, 1));
  const step = Math.min(0.9, half * 0.2);

  const prongPath = (s: number, baseSite: number): THREE.Vector3[] => {
    const p = pointAt(o, s);
    const b = pointAt(o, baseSite);
    const off = r * 1.05;
    const pts = [
      v3(b.x * bs, baseY + r * 0.5, b.z * bs),
      v3((p.x + b.x) * 0.5 * sMid + p.nx * off, yMid, (p.z + b.z) * 0.5 * sMid + p.nz * off),
      v3(p.x + p.nx * off, -gt * 0.5 - 0.15, p.z + p.nz * off),
      v3(p.x + p.nx * off * 0.9, crownY(stone, o, 0) + r * 0.2, p.z + p.nz * off * 0.9),
    ];
    if (depthBelow < 0.35) pts.splice(1, 1); // very low seat: skip the pavilion waypoint
    return pts;
  };

  const tip = (s: number) => {
    const p = pointAt(o, s);
    const n = v3(p.nx, 0, p.nz);
    const t = v3(p.tx, 0, p.tz);
    const top = v3(p.x + p.nx * r * 0.95, crownY(stone, o, 0) + r * 0.2, p.z + p.nz * r * 0.95);
    switch (opts.style) {
      case 'round': {
        const c = v3(p.x + p.nx * r * 0.25, crownY(stone, o, r * 0.6) + r * 0.45, p.z + p.nz * r * 0.25);
        out.push(...rod(top, c, r, r * 1.05));
        break;
      }
      case 'claw': {
        const end = v3(p.x - p.nx * r * 1.3, crownY(stone, o, r * 1.3) + r * 0.2, p.z - p.nz * r * 1.3);
        out.push(...rod(top, end, r, r * 0.12));
        break;
      }
      case 'tab': {
        const d = r * 0.7;
        const c = v3(p.x - p.nx * d * 0.4, crownY(stone, o, d * 0.4) + r * 0.3, p.z - p.nz * d * 0.4);
        const slope = Math.atan2(crownY(stone, o, d) - crownY(stone, o, 0), d);
        const ax = n.clone().multiplyScalar(-Math.cos(slope)).add(v3(0, Math.sin(slope), 0)).normalize();
        const az = t.clone();
        const ay = az.clone().cross(ax).normalize();
        out.push(orientedBox(c, [r * 2.6, r * 0.7, r * 2.4], ax, ay, az));
        out.push(ball(top, r, 1));
        break;
      }
      case 'v': {
        // Chevron: two bars running along the outline either side of the site, hugging the crown edge.
        const len = Math.min(1.4, o.perimeter * 0.05) + r;
        const a = pointAt(o, s - len);
        const b = pointAt(o, s + len);
        const y0 = crownY(stone, o, 0) + r * 0.25;
        const corner = v3(p.x + p.nx * r * 0.2, y0 + r * 0.15, p.z + p.nz * r * 0.2);
        out.push(...rod(corner, v3(a.x - a.nx * r * 0.2, y0, a.z - a.nz * r * 0.2), r * 0.95, r * 0.6));
        out.push(...rod(corner, v3(b.x - b.nx * r * 0.2, y0, b.z - b.nz * r * 0.2), r * 0.95, r * 0.6));
        out.push(ball(top, r, 1));
        break;
      }
    }
  };

  sites.forEach((s, i) => {
    if (opts.double || opts.split) {
      const d = Math.min(step, r * 1.6);
      for (const sgn of [-1, 1]) {
        const path = prongPath(s + sgn * d, opts.split ? s : s + sgn * d);
        if (opts.split) {
          // shared post to just under the girdle, then two branches
          const post = path.slice(0, path.length - 2);
          const branch = path.slice(path.length - 3);
          if (sgn < 0) out.push(...wire(post, r));
          out.push(...wire(branch, r * 0.8, 10, 7));
        } else out.push(...wire(path, r * 0.8, 20, 7));
        const p = pointAt(o, s + sgn * d);
        const top = v3(p.x + p.nx * r * 0.8, crownY(stone, o, 0) + r * 0.2, p.z + p.nz * r * 0.8);
        const c = v3(p.x + p.nx * r * 0.2, crownY(stone, o, r * 0.5) + r * 0.35, p.z + p.nz * r * 0.2);
        out.push(...rod(top, c, r * 0.8, r * 0.85));
      }
    } else {
      let baseSite = s;
      if (opts.trellis) {
        const nxt = sites[(i + (i % 2 === 0 ? 1 : -1) + sites.length) % sites.length];
        baseSite = nxt;
      }
      const path = prongPath(s, baseSite);
      if (opts.trellis && i % 2 === 1) path[1].add(v3(path[1].x, 0, path[1].z).normalize().multiplyScalar(r * 1.6));
      out.push(...wire(path, r));
      tip(s);
    }
  });

  // Gallery rails, hugging the pavilion just outside the prongs.
  for (const f of opts.rails ?? []) {
    const y = -Math.min(f * pd, depthBelow - r * 2);
    if (y > -gt * 0.5 - r) continue;
    const sc = scaleAt(y);
    const path = resample(o, 64, 2);
    out.push(loop(path.map((p) => v3(p.x * sc + p.nx * r * 1.05, y, p.z * sc + p.nz * r * 1.05)), r * 0.8, 72, 7));
  }
  // Seat ring at the base.
  if (opts.seat !== false) {
    const path = resample(o, 48, 2);
    out.push(loop(path.map((p) => v3(p.x * bs, baseY + r * 0.9, p.z * bs)), r * 0.95, 48, 7));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Placement helpers
// ---------------------------------------------------------------------------------------------

/** Drop (mm) of the shank's top surface at distance x along the band from the top of the ring. */
export function ringDrop(ctx: HeadCtx, x: number): number {
  const R = ctx.innerRadius + 1.8; // typical shank thickness
  const ax = Math.min(Math.abs(x), R * 0.95);
  return R - Math.sqrt(R * R - ax * ax);
}

/** Matrix placing a stone-frame object at (x, y, z), with its local +X along (ux, uz), optionally tilting its table. */
export function placeMatrix(x: number, y: number, z: number, ux: number, uz: number, tiltOutward = 0, nx = 0, nz = 0): THREE.Matrix4 {
  const X = v3(ux, 0, uz).normalize();
  let Y = v3(0, 1, 0);
  if (tiltOutward !== 0) Y = v3(nx * Math.sin(tiltOutward), Math.cos(tiltOutward), nz * Math.sin(tiltOutward)).normalize();
  const Z = X.clone().cross(Y).normalize();
  const X2 = Y.clone().cross(Z).normalize();
  return new THREE.Matrix4().makeBasis(X2, Y, Z).setPosition(x, y, z);
}

export interface AccentRingOpts {
  /** closed path the stone centres follow */
  path: CleanOutline;
  /** stone size (length along the path), mm */
  size: number;
  /** y of the accent girdle */
  y: number;
  /** extra space between stones, mm */
  spacing: number;
  /** tilt the tables outward (radians) */
  tilt?: number;
  /** shared-bead prongs between stones */
  beads?: boolean;
  /** metal frame under the stones */
  frame?: boolean;
  frameDepth?: number;
  minCount?: number;
}

export interface AccentRingResult {
  stones: THREE.BufferGeometry;
  metal: THREE.BufferGeometry[];
  count: number;
  /** sampled path points (stone centres) */
  centers: PathPt[];
}

/** Dims of an accent stone of a given size (length) for its cut. */
export function accentDims(ctx: HeadCtx, size: number, cut = ctx.accent.cut): { length: number; width: number; depth: number } {
  const aspect = Math.max(1, cut.defaultAspect || 1);
  const width = size / aspect;
  return { length: size, width, depth: width * (cut.defaultDepthPct || 0.6) };
}

/** A ring of accent stones (halo / cluster / hidden halo) following a path, with frame and beads. */
export function accentRing(ctx: HeadCtx, o: AccentRingOpts): AccentRingResult {
  const dims = accentDims(ctx, o.size);
  const built = ctx.stone(ctx.accent.cut.id, dims, { detail: 'low' });
  const pitch = o.size + o.spacing;
  const count = Math.max(o.minCount ?? 6, Math.floor(o.path.perimeter / pitch));
  const centers: PathPt[] = [];
  const mats: THREE.Matrix4[] = [];
  const tilt = o.tilt ?? 0;
  for (let i = 0; i < count; i++) {
    const p = pointAt(o.path, (i / count) * o.path.perimeter);
    // use smoothed normal from neighbours for a calm layout
    const a = pointAt(o.path, ((i - 0.5) / count) * o.path.perimeter);
    const b = pointAt(o.path, ((i + 0.5) / count) * o.path.perimeter);
    const t = norm2([b.x - a.x, b.z - a.z]);
    p.tx = t[0];
    p.tz = t[1];
    p.nx = t[1];
    p.nz = -t[0];
    centers.push(p);
    mats.push(placeMatrix(p.x, o.y, p.z, p.tx, p.tz, tilt, p.nx, p.nz));
  }
  const stones = instanceGeometry(toFlat(built.geometry), mats);
  const metal: THREE.BufferGeometry[] = [];
  const w = dims.width / 2;
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);
  const rot = (u: number, v: number): V2 => [u * cosT + v * sinT, o.y - u * sinT + v * cosT];
  if (o.frame !== false) {
    const depth = o.frameDepth ?? Math.max(0.5, built.pavilionDepth * 0.9 + 0.25);
    const section: V2[] = [rot(-w - 0.2, -0.05), rot(-w - 0.12, -depth), rot(w + 0.12, -depth), rot(w + 0.2, -0.05)];
    metal.push(loft(resample(o.path, Math.max(48, count * 3), 1), section, true));
  }
  if (o.beads !== false) {
    const beadR = Math.max(0.12, o.size * 0.16);
    const beadGeo = new THREE.IcosahedronGeometry(beadR, 0);
    const bm: THREE.Matrix4[] = [];
    for (let i = 0; i < count; i++) {
      const p = pointAt(o.path, ((i + 0.5) / count) * o.path.perimeter);
      const a = centers[i];
      for (const side of [-1, 1]) {
        const [off, y] = rot(side * (w * 0.85), built.crownHeight * 0.4 + beadR * 0.3);
        bm.push(new THREE.Matrix4().makeTranslation(p.x + a.nx * off, y, p.z + a.nz * off));
      }
    }
    metal.push(instanceGeometry(toFlat(beadGeo), bm));
  }
  return { stones, metal, count, centers };
}

// ---------------------------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------------------------

export function metalPart(geos: THREE.BufferGeometry[], label: string): Part {
  return { slot: 'head-metal', geometry: mergeFlat(geos.filter((g) => g.getAttribute('position')?.count > 0)), label };
}
export function accentPart(geos: THREE.BufferGeometry[], label: string): Part {
  return { slot: 'accent-stone', geometry: mergeFlat(geos.filter((g) => g.getAttribute('position')?.count > 0)), label };
}

/** Transform a list of geometries by a matrix (in place) and return them. */
export function transformAll(geos: THREE.BufferGeometry[], m: THREE.Matrix4): THREE.BufferGeometry[] {
  for (const g of geos) g.applyMatrix4(m);
  return geos;
}

export { v3 };

/** Standard defaults derived from the centre stone. */
export function baseScaleFor(o: CleanOutline, ctx: HeadCtx, frac: number): number {
  // footprint ~ frac of the outline but never narrower than ~1.6 mm or wider than the shank allows comfortably
  const r = meanRadius(o);
  const wanted = Math.max(0.8, Math.min(r * frac, Math.max(ctx.shankWidth * 0.75, r * 0.35)));
  return Math.min(0.9, Math.max(0.15, wanted / r));
}
