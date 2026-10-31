/**
 * Pure triangle-soup math on flat position arrays (x,y,z per vertex, 3 vertices per triangle, mm).
 * Deterministic: no randomness, iteration in array order.
 */

export type Vec3 = [number, number, number];

export function triangleCount(pos: ArrayLike<number>): number {
  return Math.floor(pos.length / 9);
}

/** Signed volume by the divergence theorem (sum of signed tetrahedra to the origin). Positive for outward-facing CCW triangles. */
export function signedVolume(pos: ArrayLike<number>, tris?: ArrayLike<number>): number {
  let v = 0;
  const n = tris ? tris.length : triangleCount(pos);
  for (let k = 0; k < n; k++) {
    const t = tris ? tris[k] : k;
    const o = t * 9;
    const ax = pos[o],
      ay = pos[o + 1],
      az = pos[o + 2];
    const bx = pos[o + 3],
      by = pos[o + 4],
      bz = pos[o + 5];
    const cx = pos[o + 6],
      cy = pos[o + 7],
      cz = pos[o + 8];
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return v / 6;
}

export function surfaceArea(pos: ArrayLike<number>): number {
  let a = 0;
  for (let o = 0; o + 8 < pos.length; o += 9) {
    const ux = pos[o + 3] - pos[o],
      uy = pos[o + 4] - pos[o + 1],
      uz = pos[o + 5] - pos[o + 2];
    const vx = pos[o + 6] - pos[o],
      vy = pos[o + 7] - pos[o + 1],
      vz = pos[o + 8] - pos[o + 2];
    const cx = uy * vz - uz * vy,
      cy = uz * vx - ux * vz,
      cz = ux * vy - uy * vx;
    a += Math.hypot(cx, cy, cz) / 2;
  }
  return a;
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

export function emptyBounds(): Bounds {
  return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
}

export function expandBounds(b: Bounds, pos: ArrayLike<number>, tris?: ArrayLike<number>): Bounds {
  const n = tris ? tris.length : triangleCount(pos);
  for (let k = 0; k < n; k++) {
    const o = (tris ? tris[k] : k) * 9;
    for (let j = 0; j < 9; j += 3)
      for (let a = 0; a < 3; a++) {
        const x = pos[o + j + a];
        if (x < b.min[a]) b.min[a] = x;
        if (x > b.max[a]) b.max[a] = x;
      }
  }
  return b;
}

export function boundsOf(pos: ArrayLike<number>, tris?: ArrayLike<number>): Bounds {
  return expandBounds(emptyBounds(), pos, tris);
}

export const isEmptyBounds = (b: Bounds): boolean => !(b.max[0] >= b.min[0]);

export interface Component {
  /** Triangle indices belonging to this connected piece. */
  tris: number[];
  /** |signed volume| in mm³. */
  volume: number;
  bounds: Bounds;
}

/**
 * Splits a triangle soup into connected components (triangles sharing a vertex position, welded at 1e-4 mm)
 * and measures each. Components are returned in order of their first triangle.
 */
export function components(pos: ArrayLike<number>): Component[] {
  const nt = triangleCount(pos);
  const parent = new Int32Array(nt);
  for (let i = 0; i < nt; i++) parent[i] = i;
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a),
      rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  const seen = new Map<string, number>();
  const q = (x: number) => Math.round(x * 1e4);
  for (let t = 0; t < nt; t++) {
    for (let j = 0; j < 3; j++) {
      const o = t * 9 + j * 3;
      const key = `${q(pos[o])},${q(pos[o + 1])},${q(pos[o + 2])}`;
      const hit = seen.get(key);
      if (hit === undefined) seen.set(key, t);
      else union(hit, t);
    }
  }
  const groups = new Map<number, number[]>();
  for (let t = 0; t < nt; t++) {
    const r = find(t);
    const list = groups.get(r);
    if (list) list.push(t);
    else groups.set(r, [t]);
  }
  const out: Component[] = [];
  for (const tris of groups.values())
    out.push({ tris, volume: Math.abs(signedVolume(pos, tris)), bounds: boundsOf(pos, tris) });
  return out;
}

/** Volume of a possibly multi-piece soup: sum of |volume| of each closed piece (robust to inverted pieces). */
export function solidVolume(pos: ArrayLike<number>): number {
  return components(pos).reduce((s, c) => s + c.volume, 0);
}
