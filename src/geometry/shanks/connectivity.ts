/**
 * Test support: checks that every separately built piece of a metal part (beads, leaves, loops, arches ...) is fused
 * to the main band, directly or through other pieces. A piece counts as attached to another when one of its vertices
 * lies inside the other (closed) piece, or within `tol` mm of its surface.
 */
import type * as THREE from 'three';

export interface Island {
  /** triangles in the piece */
  tris: number;
  /** centre of the piece's bounding box */
  centre: [number, number, number];
}

interface Tri {
  comp: number;
  a: [number, number, number];
  b: [number, number, number];
  c: [number, number, number];
}

type V3 = [number, number, number];

function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Squared distance from p to triangle abc (Ericson, Real-Time Collision Detection 5.1.5). */
function distSqToTri(p: V3, a: V3, b: V3, c: V3): number {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  const at = (q: V3) => dot(sub(p, q), sub(p, q));
  if (d1 <= 0 && d2 <= 0) return at(a);
  const bp = sub(p, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return at(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return at([a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v]);
  }
  const cp = sub(p, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return at(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return at([a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w]);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return at([b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]);
  }
  const den = 1 / (va + vb + vc);
  const v = vb * den;
  const w = vc * den;
  return at([a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]);
}

/** Does the ray from p along +Z cross triangle abc? (strictly above p) */
function rayZHits(p: V3, a: V3, b: V3, c: V3): boolean {
  const e1 = sub(b, a);
  const e2 = sub(c, a);
  const n = cross(e1, e2);
  if (Math.abs(n[2]) < 1e-12) return false;
  const t = dot(n, sub(a, p)) / n[2];
  if (t <= 0) return false;
  // barycentric test in the xy projection
  const x = p[0];
  const y = p[1];
  const s1 = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
  const s2 = (c[0] - b[0]) * (y - b[1]) - (c[1] - b[1]) * (x - b[0]);
  const s3 = (a[0] - c[0]) * (y - c[1]) - (a[1] - c[1]) * (x - c[0]);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}

/** Pieces of the geometries (welded by position) that are not fused to the largest piece. */
export function detachedIslands(geos: THREE.BufferGeometry[], tol = 0.05): Island[] {
  const keyOf = (x: number, y: number, z: number) =>
    `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
  const ids = new Map<string, number>();
  const verts: V3[] = [];
  const triV: number[] = [];
  for (const g of geos) {
    const pos = g.getAttribute('position');
    const idx = g.getIndex();
    const count = idx ? idx.count : pos.count;
    for (let k = 0; k < count; k++) {
      const i = idx ? idx.getX(k) : k;
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const key = keyOf(x, y, z);
      let id = ids.get(key);
      if (id === undefined) {
        id = verts.length;
        verts.push([x, y, z]);
        ids.set(key, id);
      }
      triV.push(id);
    }
  }
  // union-find over triangles' vertices
  const parent = verts.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let t = 0; t + 2 < triV.length; t += 3) {
    const a = find(triV[t]);
    for (const o of [triV[t + 1], triV[t + 2]]) {
      const b = find(o);
      if (a !== b) parent[b] = a;
    }
  }
  const compOf = new Map<number, number>();
  const vComp = verts.map((_, i) => {
    const r = find(i);
    let c = compOf.get(r);
    if (c === undefined) {
      c = compOf.size;
      compOf.set(r, c);
    }
    return c;
  });
  const nComp = compOf.size;
  const triCount = new Array<number>(nComp).fill(0);
  const tris: Tri[] = [];
  for (let t = 0; t + 2 < triV.length; t += 3) {
    const comp = vComp[triV[t]];
    triCount[comp]++;
    tris.push({ comp, a: verts[triV[t]], b: verts[triV[t + 1]], c: verts[triV[t + 2]] });
  }
  if (nComp <= 1) return [];
  let main = 0;
  for (let c = 1; c < nComp; c++) if (triCount[c] > triCount[main]) main = c;

  // spatial hashes: 3D cells for proximity, xy columns for the inside test
  const cell = 0.5;
  const grid = new Map<string, number[]>();
  const cols = new Map<string, number[]>();
  const fl = (v: number) => Math.floor(v / cell);
  tris.forEach((t, ti) => {
    const lo = [0, 1, 2].map((d) => fl(Math.min(t.a[d], t.b[d], t.c[d]) - tol));
    const hi = [0, 1, 2].map((d) => fl(Math.max(t.a[d], t.b[d], t.c[d]) + tol));
    for (let i = lo[0]; i <= hi[0]; i++)
      for (let j = lo[1]; j <= hi[1]; j++) {
        const ck = `${i},${j}`;
        const cl = cols.get(ck);
        if (cl) cl.push(ti);
        else cols.set(ck, [ti]);
        for (let k = lo[2]; k <= hi[2]; k++) {
          const key = `${i},${j},${k}`;
          const l = grid.get(key);
          if (l) l.push(ti);
          else grid.set(key, [ti]);
        }
      }
  });

  const adj: Set<number>[] = Array.from({ length: nComp }, () => new Set<number>());
  const link = (a: number, b: number) => {
    adj[a].add(b);
    adj[b].add(a);
  };
  const vertsByComp: number[][] = Array.from({ length: nComp }, () => []);
  vComp.forEach((c, i) => vertsByComp[c].push(i));
  const tol2 = tol * tol;
  for (let c = 0; c < nComp; c++) {
    if (c === main) continue;
    for (const vi of vertsByComp[c]) {
      const v = verts[vi];
      const near = grid.get(`${fl(v[0])},${fl(v[1])},${fl(v[2])}`) ?? [];
      for (const ti of near) {
        const t = tris[ti];
        if (t.comp === c || adj[c].has(t.comp)) continue;
        if (distSqToTri(v, t.a, t.b, t.c) <= tol2) link(c, t.comp);
      }
      // inside another piece: odd number of crossings straight up (origin nudged off edges)
      const p: V3 = [v[0] + 1.37e-5, v[1] + 0.71e-5, v[2]];
      const hits = new Map<number, number>();
      for (const ti of cols.get(`${fl(p[0])},${fl(p[1])}`) ?? []) {
        const t = tris[ti];
        if (t.comp === c || adj[c].has(t.comp)) continue;
        if (rayZHits(p, t.a, t.b, t.c)) hits.set(t.comp, (hits.get(t.comp) ?? 0) + 1);
      }
      for (const [d, n] of hits) if (n % 2 === 1) link(c, d);
    }
  }
  const seen = new Set<number>([main]);
  const queue = [main];
  while (queue.length) {
    const c = queue.pop() as number;
    for (const d of adj[c])
      if (!seen.has(d)) {
        seen.add(d);
        queue.push(d);
      }
  }
  const out: Island[] = [];
  for (let c = 0; c < nComp; c++) {
    if (seen.has(c)) continue;
    const lo: V3 = [Infinity, Infinity, Infinity];
    const hi: V3 = [-Infinity, -Infinity, -Infinity];
    for (const vi of vertsByComp[c])
      for (let d = 0; d < 3; d++) {
        lo[d] = Math.min(lo[d], verts[vi][d]);
        hi[d] = Math.max(hi[d], verts[vi][d]);
      }
    out.push({
      tris: triCount[c],
      centre: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2],
    });
  }
  return out;
}
