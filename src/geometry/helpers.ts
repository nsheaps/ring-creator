import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export { mergeGeometries };

export type ProfilePoint = [number, number]; // [u = axial (ring Z), r = radial distance from the ring axis]

export interface SweepOptions {
  /** Number of slices around the ring. */
  segments?: number;
  /** Start / end angle (radians). Default: full loop 0..2PI. */
  thetaStart?: number;
  thetaEnd?: number;
  /**
   * Cross-section at angle theta: a CLOSED polygon (do not repeat the first point) of [u, r] points,
   * ordered counter-clockwise when viewed with u to the right and r up. Every call must return the SAME number of points.
   */
  profile: (theta: number) => ProfilePoint[];
  /** Axial displacement of the whole section at theta (contour bands, bypass). */
  zOffset?: (theta: number) => number;
  /** Share vertices across profile edges (rounded look). Default false: hard edges at profile corners. */
  smoothProfile?: boolean;
}

/**
 * Sweeps a varying cross-section around the Z axis. Returns an indexed BufferGeometry with normals.
 * Full loops wrap without a seam. Open sweeps (partial angle) are capped with flat ends.
 */
export function sweepRing(opts: SweepOptions): THREE.BufferGeometry {
  const segments = opts.segments ?? 128;
  const t0 = opts.thetaStart ?? 0;
  const t1 = opts.thetaEnd ?? Math.PI * 2;
  const full = Math.abs(t1 - t0 - Math.PI * 2) < 1e-6;
  const slices = full ? segments : segments + 1;
  const first = opts.profile(t0);
  const n = first.length;
  const smooth = !!opts.smoothProfile;
  const perSlice = smooth ? n : n * 2; // hard edges: each edge owns two vertices
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < slices; i++) {
    const theta = t0 + ((t1 - t0) * i) / segments;
    const prof = i === 0 ? first : opts.profile(theta);
    if (prof.length !== n) throw new Error('sweepRing: profile point count changed between slices');
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const dz = opts.zOffset ? opts.zOffset(theta) : 0;
    const emit = (p: ProfilePoint) => positions.push(p[1] * c, p[1] * s, p[0] + dz);
    if (smooth) prof.forEach(emit);
    else
      for (let k = 0; k < n; k++) {
        emit(prof[k]);
        emit(prof[(k + 1) % n]); // second vertex of edge k
      }
  }
  const next = (i: number) => (full ? (i + 1) % slices : i + 1);
  const quadCount = full ? slices : slices - 1;
  for (let i = 0; i < quadCount; i++) {
    const a = i * perSlice;
    const b = next(i) * perSlice;
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      const [p0, p1, q0, q1] = smooth
        ? [a + k, a + k1, b + k, b + k1]
        : [a + k * 2, a + k * 2 + 1, b + k * 2, b + k * 2 + 1];
      indices.push(p0, q0, p1, p1, q0, q1);
    }
  }
  if (!full) {
    const cap = (sliceIdx: number, flip: boolean) => {
      const base = positions.length / 3;
      const prof = opts.profile(sliceIdx === 0 ? t0 : t1);
      const theta = sliceIdx === 0 ? t0 : t1;
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      const dz = opts.zOffset ? opts.zOffset(theta) : 0;
      prof.forEach((p) => positions.push(p[1] * c, p[1] * s, p[0] + dz));
      for (let k = 1; k < n - 1; k++) {
        if (flip) indices.push(base, base + k + 1, base + k);
        else indices.push(base, base + k, base + k + 1);
      }
    };
    cap(0, true);
    cap(1, false);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Rounded-rectangle-ish / D-shape cross-section helper: a superellipse-ish polygon centred at (u0, r0). */
export function roundedSection(
  u0: number,
  r0: number,
  width: number,
  height: number,
  roundness = 0.5,
  points = 16,
): ProfilePoint[] {
  const out: ProfilePoint[] = [];
  const e = 2 / Math.max(0.15, 0.5 + roundness * 1.5); // exponent: 2 = ellipse, larger = boxier
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    out.push([
      u0 + (width / 2) * Math.sign(ca) * Math.abs(ca) ** (2 / e),
      r0 + (height / 2) * Math.sign(sa) * Math.abs(sa) ** (2 / e),
    ]);
  }
  return out;
}

/** Tapered cylinder from a to b (radius ra at a, rb at b). */
export function cylinderBetween(
  a: THREE.Vector3,
  b: THREE.Vector3,
  ra: number,
  rb: number,
  radial = 10,
): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(rb, ra, len, radial, 1, false); // top = b side
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    b.clone().sub(a).normalize(),
  );
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

/** Instances one geometry at many matrices into a single merged geometry. */
export function instanceGeometry(geo: THREE.BufferGeometry, matrices: THREE.Matrix4[]): THREE.BufferGeometry {
  if (matrices.length === 0) return new THREE.BufferGeometry();
  const base = geo.index ? geo.toNonIndexed() : geo;
  const list = matrices.map((m) => base.clone().applyMatrix4(m));
  const merged = mergeGeometries(list, false);
  list.forEach((g) => g.dispose());
  return merged ?? new THREE.BufferGeometry();
}

/** Make any geometry non-indexed with consistent attributes (position, normal) so it can be merged with faceted gems. */
export function toFlat(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const name of Object.keys(g.attributes))
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

/** Merge parts that share a slot-material into one geometry (all must be non-indexed w/ position+normal; use toFlat first). */
export function mergeFlat(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geos.length === 0) return new THREE.BufferGeometry();
  const m = mergeGeometries(geos.map(toFlat), false);
  return m ?? new THREE.BufferGeometry();
}

// ---------------------------------------------------------------------------------------------
// Wires: round or flat strands that follow any closed path around the ring (rope, braid, vine)
// ---------------------------------------------------------------------------------------------

export interface WireOptions {
  /** Number of samples along the loop. */
  samples: number;
  /** Points around the wire section. */
  sides?: number;
  /** Half extents of the (elliptical) section at loop parameter s in [0, 1): [radial-ish, axial-ish]. */
  radius: (s: number) => [number, number];
}

/**
 * A closed tube along a closed loop `center(s)`, s in [0, 1), that winds once around the ring axis (+Z).
 * The section frame is tied to the ring (N = radial direction made perpendicular to the path, B = T x N), so
 * the section never twists and the loop closes without a seam. The section is perpendicular to the path,
 * so steep helices (ropes, braids) keep round wires instead of pinched ones. Indexed, outward winding, smooth normals.
 */
export function wireLoop(center: (s: number) => THREE.Vector3, o: WireOptions): THREE.BufferGeometry {
  const n = Math.max(8, Math.round(o.samples));
  const m = Math.max(4, Math.round(o.sides ?? 10));
  const pos: number[] = [];
  const idx: number[] = [];
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const s = i / n;
    const p = center(s);
    T.subVectors(center((i + 1) / n), center((i - 1 + n) / n)).normalize();
    N.set(p.x, p.y, 0).normalize();
    N.addScaledVector(T, -N.dot(T)).normalize();
    B.crossVectors(T, N);
    const [a, b] = o.radius(s);
    for (let k = 0; k < m; k++) {
      const phi = (k / m) * Math.PI * 2;
      const c = Math.cos(phi) * a;
      const d = Math.sin(phi) * b;
      pos.push(p.x + N.x * c + B.x * d, p.y + N.y * c + B.y * d, p.z + N.z * c + B.z * d);
    }
  }
  for (let i = 0; i < n; i++) {
    const i1 = (i + 1) % n;
    for (let k = 0; k < m; k++) {
      const k1 = (k + 1) % m;
      const a = i * m + k;
      const b = i * m + k1;
      const c = i1 * m + k;
      const d = i1 * m + k1;
      // (dphi x ds) points away from the path centre: outward
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Smallest distance from the ring axis over a set of geometries. */
export function minRadial(geos: THREE.BufferGeometry[]): number {
  let m = Infinity;
  for (const g of geos) {
    const a = g.getAttribute('position');
    for (let i = 0; i < a.count; i++) m = Math.min(m, Math.hypot(a.getX(i), a.getY(i)));
  }
  return m;
}

/** Moves every vertex radially (away from the ring axis) by the same amount so the lowest point lands exactly on R. */
export function pinRadial(geos: THREE.BufferGeometry[], R: number): void {
  const d = R - minRadial(geos);
  if (!Number.isFinite(d) || Math.abs(d) < 1e-9) return;
  for (const g of geos) {
    const a = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i);
      const y = a.getY(i);
      const r = Math.hypot(x, y) || 1;
      a.setXY(i, x * ((r + d) / r), y * ((r + d) / r));
    }
    a.needsUpdate = true;
    if (g.getAttribute('normal')) g.computeVertexNormals();
  }
}

export interface RopeOptions {
  /** inner radius: the lowest wire surface sits here */
  R: number;
  /** axial width and radial thickness of the whole rope */
  W: number;
  T: number;
  strands: number;
  /** full turns of the twist around the ring */
  turns: number;
  /** wire size relative to the size where neighbouring wires just touch (1 = touching) */
  wire?: number;
  /** axial offset of the rope centre at angle theta (contour bands) */
  z?: (theta: number) => number;
  sides?: number;
  /** triangle budget for all strands together */
  budget?: number;
}

/** Twisted rope: `strands` round wires wound helically around the band centreline, touching each other. One geometry per strand. */
export function ropeStrands(o: RopeOptions): THREE.BufferGeometry[] {
  const k = Math.max(2, Math.round(o.strands));
  const d = Math.min(o.W, o.T);
  // wires of radius rs on a circle of radius rs / sin(PI/k) just touch their neighbours
  const touch = d / 2 / (1 + 1 / Math.sin(Math.PI / k));
  const rs = touch * Math.min(1.25, Math.max(0.6, o.wire ?? 1));
  const au = Math.max(0.02, o.W / 2 - rs);
  const ar = Math.max(0.02, o.T / 2 - rs);
  const Rc = o.R + o.T / 2;
  const sides = o.sides ?? 10;
  const samples = Math.min(Math.max(160, o.turns * 26), Math.floor((o.budget ?? 40000) / (2 * sides * k)));
  const out: THREE.BufferGeometry[] = [];
  for (let j = 0; j < k; j++) {
    const ph = (j / k) * Math.PI * 2;
    out.push(
      wireLoop(
        (s) => {
          const th = s * Math.PI * 2;
          const a = o.turns * th + ph;
          const r = Rc + ar * Math.sin(a);
          return new THREE.Vector3(
            r * Math.cos(th),
            r * Math.sin(th),
            au * Math.cos(a) + (o.z ? o.z(th) : 0),
          );
        },
        { samples, sides, radius: () => [rs, rs] },
      ),
    );
  }
  pinRadial(out, o.R);
  return out;
}

export interface BraidOptions {
  R: number;
  W: number;
  T: number;
  /** braid repeats around the ring */
  cycles: number;
  /** ribbon width across the band (mm); the ribbon thickness follows from T */
  ribbon: number;
  z?: (theta: number) => number;
  sides?: number;
  budget?: number;
}

/**
 * Three-strand plait: strand k runs at lateral A*sin(a_k) and height B*sin(2 a_k), a_k = cycles*theta + 2PI*k/3,
 * so wherever two strands cross one is above the other, alternating over and under. Strands are flat ribbons.
 */
export function braidStrands(o: BraidOptions): THREE.BufferGeometry[] {
  // at a crossing the strands are 2B*sin(60deg) apart radially: B >= rr / sin(60deg) keeps them from intersecting
  const rr = o.T / 2 / (1 + 1 / Math.sin(Math.PI / 3));
  const B = o.T / 2 - rr;
  const rb = Math.min(o.ribbon / 2, o.W * 0.3);
  const A = Math.max(0.1, o.W / 2 - rb);
  const Rc = o.R + o.T / 2;
  const sides = o.sides ?? 10;
  const cycles = Math.max(3, Math.round(o.cycles));
  const samples = Math.min(Math.max(180, cycles * 36), Math.floor((o.budget ?? 40000) / (2 * sides * 3)));
  const out: THREE.BufferGeometry[] = [];
  for (let j = 0; j < 3; j++) {
    const ph = (j / 3) * Math.PI * 2;
    out.push(
      wireLoop(
        (s) => {
          const th = s * Math.PI * 2;
          const a = cycles * th + ph;
          const r = Rc + B * Math.sin(2 * a);
          return new THREE.Vector3(r * Math.cos(th), r * Math.sin(th), A * Math.sin(a) + (o.z ? o.z(th) : 0));
        },
        { samples, sides, radius: () => [rr, rb] },
      ),
    );
  }
  pinRadial(out, o.R);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Stone rows: how many stones fit, and at what pitch
// ---------------------------------------------------------------------------------------------

export interface StoneFit {
  /** number of stones */
  count: number;
  /** stone size along the row (may shrink slightly so a full circle closes evenly) */
  size: number;
  /** centre-to-centre distance along the arc, mm */
  pitch: number;
  /** stone centre angles (radians) */
  angles: number[];
}

/**
 * Lays a row of stones of `size` (along the row) with `gap` of metal between neighbours on the arc [a0, a1] at radius r.
 * Full circles shrink the stones a touch so the last stone meets the first with the same gap; partial arcs keep
 * the exact size and pitch and centre the row on the arc.
 */
export function fitStones(a0: number, a1: number, r: number, size: number, gap: number): StoneFit {
  const span = a1 - a0;
  const arc = Math.abs(span) * r;
  const full = Math.abs(Math.abs(span) - Math.PI * 2) < 1e-6;
  if (full) {
    const count = Math.max(3, Math.ceil(arc / (size + gap)));
    const pitch = arc / count;
    const step = span / count;
    return {
      count,
      size: Math.max(0.1, pitch - gap),
      pitch,
      angles: Array.from({ length: count }, (_, i) => a0 + step * (i + 0.5)),
    };
  }
  const pitch = size + gap;
  const count = Math.max(0, Math.floor((arc + gap) / pitch));
  const step = (pitch / r) * Math.sign(span || 1);
  const start = (a0 + a1) / 2 - (step * (count - 1)) / 2;
  return { count, size, pitch, angles: Array.from({ length: count }, (_, i) => start + step * i) };
}
