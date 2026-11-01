/**
 * Frame outlines (hexagon, octagon, cushion ...) that enclose a stone's girdle, plus a loft between two outlines.
 * Used by the polygon / cushion bezels, the polygon halo and the Art Deco plaque. Stone frame, millimetres.
 */
import * as THREE from 'three';
import {
  arcAtDirection,
  cleanOutline,
  pointAt,
  signedVolume,
  support,
  templateOutline,
  v3,
  type CleanOutline,
  type V2,
} from './common';

export interface PolygonOpts {
  /** number of sides, 3 to 12 */
  sides: number;
  /** clear space between the stone's girdle and the polygon's nearest edge, mm */
  gap: number;
  /** extra rotation in degrees (0 = a corner on +X for an even-sided hexagon, flat edges on the axes otherwise) */
  rotationDeg?: number;
  /** corner rounding radius, mm */
  corner?: number;
  /** stretch the polygon to the stone's aspect (elongated hexagon round an oval) */
  stretch?: boolean;
}

/** Half extents of an outline about the origin. */
function halfExtents(o: CleanOutline): [number, number] {
  return [(support(o, 1, 0) + support(o, -1, 0)) / 2, (support(o, 0, 1) + support(o, 0, -1)) / 2];
}

/**
 * A rounded regular polygon that contains the whole outline plus `gap`. With `stretch` it is scaled along X and Z to the
 * stone's own proportions (limited to 1:2), so an oval gets an elongated hexagon.
 */
export function polygonFrame(o: CleanOutline, p: PolygonOpts): CleanOutline {
  const n = Math.max(3, Math.min(12, Math.round(p.sides)));
  const [hx, hz] = halfExtents(o);
  const sx = p.stretch ? Math.min(2, Math.max(0.5, hx / Math.max(0.1, hz))) : 1;
  const phi0 = (n % 4 === 0 ? Math.PI / n : 0) + ((p.rotationDeg ?? 0) * Math.PI) / 180;
  // edge normals sit between the corners
  const normals: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = phi0 + ((i + 0.5) / n) * Math.PI * 2;
    normals.push([Math.cos(a), Math.sin(a)]);
  }
  let apothem = 0;
  for (const q of o.pts) {
    const x = q[0] / sx;
    const z = q[1];
    for (const m of normals) apothem = Math.max(apothem, x * m[0] + z * m[1]);
  }
  apothem += Math.max(0, p.gap);
  const half = Math.PI / n;
  const rc = Math.min(Math.max(0, p.corner ?? 0.5), apothem * 0.4);
  const pts: V2[] = [];
  const arcSteps = rc > 0.05 ? 5 : 0;
  const sub = 3; // extra points along each edge so the loft keeps pace with the stone's curved outline
  for (let i = 0; i < n; i++) {
    const phi = phi0 + (i / n) * Math.PI * 2;
    const rv = rc > 0 ? (apothem - rc) / Math.cos(half) : apothem / Math.cos(half);
    const cx = Math.cos(phi) * rv;
    const cz = Math.sin(phi) * rv;
    if (arcSteps) {
      for (let k = 0; k <= arcSteps; k++) {
        const a = phi - half + (k / arcSteps) * 2 * half;
        pts.push([(cx + Math.cos(a) * rc) * sx, cz + Math.sin(a) * rc]);
      }
    } else pts.push([cx * sx, cz]);
    // along the next edge
    const phiN = phi0 + ((i + 1) / n) * Math.PI * 2;
    const nx = Math.cos(phiN) * rv;
    const nz = Math.sin(phiN) * rv;
    const aN = phiN - half;
    const aP = phi + half;
    const e0: V2 = [cx + Math.cos(aP) * rc, cz + Math.sin(aP) * rc];
    const e1: V2 = [nx + Math.cos(aN) * rc, nz + Math.sin(aN) * rc];
    for (let k = 1; k <= sub; k++) {
      const t = k / (sub + 1);
      pts.push([(e0[0] + (e1[0] - e0[0]) * t) * sx, e0[1] + (e1[1] - e0[1]) * t]);
    }
  }
  return cleanOutline({ points: pts, corners: [] });
}

/** A rounded square (superellipse) frame that encloses the outline plus `gap`: the cushion shape. */
export function cushionFrame(o: CleanOutline, gap: number): CleanOutline {
  return templateOutline(o, 'cushion', gap, 1.25, 128);
}

export const FRAME_SHAPES = ['polygon', 'cushion', 'oval', 'follow'] as const;
export type FrameShape = (typeof FRAME_SHAPES)[number];

/** Point of an outline in the radial direction (dx, dz) from the origin. */
export function radialPoint(o: CleanOutline, dx: number, dz: number): V2 {
  const p = pointAt(o, arcAtDirection(o, dx, dz));
  return [p.x, p.z];
}

/** One loft vertex: mix between the inner outline point (u = 0) and the outer one (u = 1), scaled by k, at height y. */
export type MixPt = [u: number, y: number, k?: number];

/** Angles (radians, sorted, no near duplicates) at which to cut the frame: its own vertices and an even spread. */
function frameAngles(outer: CleanOutline, even: number): number[] {
  const a: number[] = [];
  for (const q of outer.pts) a.push(Math.atan2(q[1], q[0]));
  for (let i = 0; i < even; i++) a.push(-Math.PI + ((i + 0.5) / even) * Math.PI * 2);
  a.sort((x, y) => x - y);
  const out: number[] = [];
  for (const v of a) if (!out.length || v - out[out.length - 1] > 1e-3) out.push(v);
  if (out.length > 1 && out[0] + Math.PI * 2 - out[out.length - 1] < 1e-3) out.pop();
  return out;
}

/**
 * Loft a closed section between an inner outline (the stone's girdle) and an outer one (the frame). Both are sampled in
 * the same directions from the origin, and a section point [u, y, k] lies at k * ((1 - u) * inner + u * outer) at height
 * y. The section is closed; output winds outward with smooth normals along the path and hard edges across the section.
 */
export function mixLoft(
  inner: CleanOutline,
  outer: CleanOutline,
  section: MixPt[],
  even = 96,
): THREE.BufferGeometry {
  const angles = frameAngles(outer, even);
  const rows: THREE.Vector3[][] = angles.map((a) => {
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const [ix, iz] = radialPoint(inner, dx, dz);
    const [ox, oz] = radialPoint(outer, dx, dz);
    return section.map(([u, y, k = 1]) => v3(k * (ix + (ox - ix) * u), y, k * (iz + (oz - iz) * u)));
  });
  const nP = rows.length;
  const m = section.length;
  const face: THREE.Vector3[][] = [];
  for (let i = 0; i < nP; i++) {
    const r: THREE.Vector3[] = [];
    for (let k = 0; k < m; k++) {
      const a = rows[i][k];
      const b = rows[i][(k + 1) % m];
      const c = rows[(i + 1) % nP][k];
      const d = rows[(i + 1) % nP][(k + 1) % m];
      const n1 = c.clone().sub(a).cross(b.clone().sub(a));
      const n2 = c.clone().sub(b).cross(d.clone().sub(b));
      r.push(n1.add(n2));
    }
    face.push(r);
  }
  const unit = (n: THREE.Vector3) => (n.lengthSq() > 0 ? n.clone().normalize() : v3(0, 1, 0));
  const vn = (i: number, k: number, seg: number): THREE.Vector3 => {
    const other = face[(seg === i ? i - 1 + nP : i) % nP][k];
    const n = unit(face[seg][k]);
    const o = unit(other);
    return n.dot(o) > 0.5 ? n.clone().add(o).normalize() : n;
  };
  const pos: number[] = [];
  const nor: number[] = [];
  const tri = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    na: THREE.Vector3,
    nb: THREE.Vector3,
    nc: THREE.Vector3,
  ) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    nor.push(na.x, na.y, na.z, nb.x, nb.y, nb.z, nc.x, nc.y, nc.z);
  };
  for (let i = 0; i < nP; i++) {
    const i1 = (i + 1) % nP;
    for (let k = 0; k < m; k++) {
      const k1 = (k + 1) % m;
      const a = rows[i][k];
      const b = rows[i][k1];
      const c = rows[i1][k];
      const d = rows[i1][k1];
      const na = vn(i, k, i);
      const nc = vn(i1, k, i);
      tri(a, c, b, na, nc, na);
      tri(b, c, d, na, nc, nc);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (signedVolume(g) < 0) {
    for (let t = 0; t < pos.length; t += 9) {
      for (let j = 0; j < 3; j++) {
        [pos[t + 3 + j], pos[t + 6 + j]] = [pos[t + 6 + j], pos[t + 3 + j]];
        [nor[t + 3 + j], nor[t + 6 + j]] = [nor[t + 6 + j], nor[t + 3 + j]];
      }
    }
    for (let t = 0; t < nor.length; t++) nor[t] = -nor[t];
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  }
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
