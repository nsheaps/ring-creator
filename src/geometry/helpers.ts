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
  return g.toNonIndexed().index ? g : g;
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
