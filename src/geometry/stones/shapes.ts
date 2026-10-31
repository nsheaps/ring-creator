import type { Params } from '@/models/types';
import { pNum } from './mesh';

/**
 * Girdle outlines as parametric curves. `at(t)` for t in [0,1) returns a point normalised to the box [-1,1]^2
 * (x = length axis, z = width axis), counter-clockwise seen from +Y (i.e. moving from +X towards -Z).
 * `corners` are parameter values of the outline's corners (prong sites); builders sample them exactly.
 */
export interface Shape {
  at(t: number): [number, number];
  corners: number[];
}

type XZ = [number, number];
const TAU = Math.PI * 2;
const wrap = (t: number) => ((t % 1) + 1) % 1;

/** Shoelace over (x,z). Negative = counter-clockwise seen from +Y (our convention). */
export function shoelaceXZ(pts: XZ[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

/** Polygon with straight (or outward-bowed) sides; side i spans t in [i/n, (i+1)/n], vertex i sits at t = i/n. */
function polygonShape(verts: XZ[], bulge: number, corners: number[]): Shape {
  const n = verts.length;
  const sgn = shoelaceXZ(verts) < 0 ? 1 : -1;
  return {
    corners,
    at(t) {
      const u = wrap(t) * n;
      const i = Math.min(n - 1, Math.floor(u));
      const s = u - i;
      const a = verts[i];
      const b = verts[(i + 1) % n];
      const tx = b[0] - a[0];
      const tz = b[1] - a[1];
      let x = a[0] + tx * s;
      let z = a[1] + tz * s;
      if (bulge !== 0) {
        const len = Math.hypot(tx, tz) || 1;
        const k = bulge * len * 4 * s * (1 - s);
        x += (sgn * -tz * k) / len;
        z += (sgn * tx * k) / len;
      }
      return [x, z];
    },
  };
}

/** Bbox-normalise to [-1,1]^2 and force counter-clockwise (seen from +Y) orientation. */
function normalise(raw: Shape): Shape {
  const M = 1440;
  const pts: XZ[] = [];
  for (let i = 0; i < M; i++) pts.push(raw.at(i / M));
  for (const c of raw.corners) pts.push(raw.at(c));
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of pts) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const mx = (minX + maxX) / 2;
  const mz = (minZ + maxZ) / 2;
  const hx = (maxX - minX) / 2 || 1;
  const hz = (maxZ - minZ) / 2 || 1;
  const ccw = shoelaceXZ(pts.slice(0, M)) < 0;
  const map = ccw ? (t: number) => wrap(t) : (t: number) => wrap(1 - t);
  return {
    corners: raw.corners.map((c) => map(c)),
    at(t) {
      const [x, z] = raw.at(map(t));
      return [(x - mx) / hx, (z - mz) / hz];
    },
  };
}

/** Vertex lists for the polygonal cuts, already counter-clockwise from +Y. `aspect` = length / width. */
export function polygonVertices(
  name: string,
  params: Params,
  aspect: number,
): { verts: XZ[]; corners: number[] } | null {
  switch (name) {
    case 'square':
      return {
        verts: [
          [1, 1],
          [1, -1],
          [-1, -1],
          [-1, 1],
        ],
        corners: [0, 1, 2, 3],
      };
    case 'triangle':
      // flat side along X at +z, apex at -z
      return {
        verts: [
          [-1, 1],
          [1, 1],
          [0, -1],
        ],
        corners: [0, 1, 2],
      };
    case 'hexagon':
      return {
        verts: [
          [1, 0],
          [0.5, -1],
          [-0.5, -1],
          [-1, 0],
          [-0.5, 1],
          [0.5, 1],
        ],
        corners: [0, 1, 2, 3, 4, 5],
      };
    case 'kite': {
      const s = pNum(params, 'kiteShoulder', -0.35);
      return {
        verts: [
          [1, 0],
          [s, -1],
          [-1, 0],
          [s, 1],
        ],
        corners: [0, 1, 2, 3],
      };
    }
    case 'shield': {
      const s = pNum(params, 'shieldShoulder', 0.05);
      const top = pNum(params, 'shieldTop', 0.8);
      return {
        verts: [
          [1, 0],
          [s, -1],
          [-1, -top],
          [-1, top],
          [s, 1],
        ],
        corners: [0, 1, 2, 3, 4],
      };
    }
    case 'octagon': {
      // cut-cornered rectangle; chamfer is a fraction of the width, kept at 45 degrees after aspect scaling
      const ch = pNum(params, 'chamfer', 0.16);
      const cz = Math.min(0.9, ch * 2);
      const cx = Math.min(0.9, cz / aspect);
      return {
        verts: [
          [1, 1 - cz],
          [1, -(1 - cz)],
          [1 - cx, -1],
          [-(1 - cx), -1],
          [-1, -(1 - cz)],
          [-1, 1 - cz],
          [-(1 - cx), 1],
          [1 - cx, 1],
        ],
        // prong sites = the middle of each cut corner (sides 1,3,5,7)
        corners: [1.5, 3.5, 5.5, 7.5],
      };
    }
    default:
      return null;
  }
}

/** Builds a normalised outline by name. Unknown names fall back to round. */
export function makeShape(name: string, params: Params, aspect: number): Shape {
  const poly = polygonVertices(name, params, aspect);
  if (poly) {
    const n = poly.verts.length;
    const bulge = pNum(params, 'bulge', 0);
    return normalise(
      polygonShape(
        poly.verts,
        bulge,
        poly.corners.map((c) => c / n),
      ),
    );
  }
  switch (name) {
    case 'cushion': {
      const p = pNum(params, 'superP', 3);
      const e = 2 / p;
      return normalise({
        corners: [1 / 8, 3 / 8, 5 / 8, 7 / 8],
        at(t) {
          const c = Math.cos(TAU * t);
          const s = Math.sin(TAU * t);
          return [Math.sign(c) * Math.abs(c) ** e, -Math.sign(s) * Math.abs(s) ** e];
        },
      });
    }
    case 'pear': {
      const m = pNum(params, 'tipPower', 1);
      return normalise({
        corners: [0],
        at(t) {
          const th = TAU * t;
          return [Math.cos(th), -Math.sin(th) * Math.sin(th / 2) ** m];
        },
      });
    }
    case 'marquise': {
      const e = pNum(params, 'tipPower', 2);
      return normalise({
        corners: [0, 0.5],
        at(t) {
          const s = Math.sin(TAU * t);
          return [Math.cos(TAU * t), -Math.sign(s) * Math.abs(s) ** e];
        },
      });
    }
    case 'heart':
      return normalise(heartShape(pNum(params, 'lobe', 0.5)));
    case 'round':
    case 'oval':
    default:
      return normalise({
        corners: [],
        at(t) {
          return [Math.cos(TAU * t), -Math.sin(TAU * t)];
        },
      });
  }
}

/**
 * Heart as cut by lapidaries: two round lobes (disks of radius `lobe`) joined by straight tangent sides to a point at +X,
 * with the cleft at -X. Sampled as a polar table r(phi) around the origin; t = 0 is the point, t = 0.5 the cleft.
 */
function heartShape(lobe: number): Shape {
  const r = clamp01(lobe, 0.35, 0.6);
  const cx = -1 + r;
  const cz = r * 0.96;
  const tip: XZ = [1, 0];
  // tangent points from the tip to each lobe
  const tangent = (sz: number): XZ => {
    const dx = cx - tip[0];
    const dz = sz * cz - tip[1];
    const d = Math.hypot(dx, dz);
    const base = Math.atan2(dz, dx);
    const off = -Math.asin(r / d) * sz; // outer tangent (away from the axis)
    const a = base + off;
    const len = Math.sqrt(d * d - r * r);
    return [tip[0] + len * Math.cos(a), tip[1] + len * Math.sin(a)];
  };
  const t1 = tangent(1);
  const t2 = tangent(-1);
  const inTri = (p: XZ) => {
    const s = (a: XZ, b: XZ) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const d1 = s(tip, t1);
    const d2 = s(t1, t2);
    const d3 = s(t2, tip);
    return (d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0);
  };
  const inside = (p: XZ) =>
    Math.hypot(p[0] - cx, p[1] - cz) <= r ||
    Math.hypot(p[0] - cx, p[1] + cz) <= r ||
    inTri(p) ||
    (p[0] >= cx && Math.abs(p[1]) <= cz && p[0] <= t1[0]);
  const M = 2048;
  const radius: number[] = [];
  for (let i = 0; i < M; i++) {
    const phi = (TAU * i) / M;
    const d: XZ = [Math.cos(phi), -Math.sin(phi)];
    // march inward from outside to find the outermost boundary, then bisect
    let hi = 2.5;
    let lo = 2.5;
    while (lo > 0 && !inside([d[0] * lo, d[1] * lo])) lo -= 0.01;
    hi = lo + 0.01;
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hi) / 2;
      if (inside([d[0] * mid, d[1] * mid])) lo = mid;
      else hi = mid;
    }
    radius.push(lo);
  }
  return {
    corners: [0, 0.5],
    at(t) {
      const u = wrap(t) * M;
      const i = Math.floor(u) % M;
      const f = u - Math.floor(u);
      const rr = radius[i] * (1 - f) + radius[(i + 1) % M] * f;
      const phi = TAU * wrap(t);
      return [rr * Math.cos(phi), -rr * Math.sin(phi)];
    },
  };
}

const clamp01 = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Area centroid of a scaled outline (x,z in mm). */
export function outlineCentroid(P: (t: number) => XZ, samples = 360): XZ {
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < samples; i++) {
    const p = P(i / samples);
    const q = P((i + 1) / samples);
    const cr = p[0] * q[1] - q[0] * p[1];
    a += cr;
    cx += (p[0] + q[0]) * cr;
    cz += (p[1] + q[1]) * cr;
  }
  if (Math.abs(a) < 1e-12) return [0, 0];
  return [cx / (3 * a), cz / (3 * a)];
}
