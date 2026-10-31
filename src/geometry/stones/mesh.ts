import * as THREE from 'three';
import type { StoneDims } from '@/models/stoneMath';
import type { Params } from '@/models/types';

export type V3 = [number, number, number];

export function pNum(p: Params, key: string, def: number): number {
  const v = p[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : def;
}

export function pStr(p: Params, key: string, def: string): string {
  const v = p[key];
  return typeof v === 'string' && v.length > 0 ? v : def;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Guards against zero / negative / non-finite dims so builders never emit NaN. */
export function safeDims(d: StoneDims): { L: number; W: number; D: number } {
  const ok = (v: number, f: number) => (Number.isFinite(v) && v > 0 ? v : f);
  const W = ok(d.width, 1);
  const L = ok(d.length, W);
  const D = ok(d.depth, W * 0.6);
  return { L, W, D };
}

/**
 * Collects non-indexed triangles. Every triangle is oriented so that its normal points away from `origin`
 * (a point inside the stone from which the whole surface is visible), so winding is outward by construction.
 * Degenerate (zero-area) triangles are dropped, which lets callers collapse rings to a keel or a point freely.
 */
export class FacetMesh {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  private readonly minLen: number;

  constructor(
    private readonly origin: V3,
    scale: number,
  ) {
    this.minLen = 1e-9 * scale * scale;
  }

  get triangleCount(): number {
    return this.positions.length / 9;
  }

  private orient(a: V3, b: V3, c: V3): { n: V3; flip: boolean } | null {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (!(len > this.minLen)) return null;
    nx /= len;
    ny /= len;
    nz /= len;
    const o = this.origin;
    const dx = (a[0] + b[0] + c[0]) / 3 - o[0];
    const dy = (a[1] + b[1] + c[1]) / 3 - o[1];
    const dz = (a[2] + b[2] + c[2]) / 3 - o[2];
    const flip = nx * dx + ny * dy + nz * dz < 0;
    return flip ? { n: [-nx, -ny, -nz], flip } : { n: [nx, ny, nz], flip };
  }

  /** Flat-shaded triangle. */
  tri(a: V3, b: V3, c: V3): void {
    const r = this.orient(a, b, c);
    if (!r) return;
    const [p, q] = r.flip ? [c, b] : [b, c];
    this.positions.push(...a, ...p, ...q);
    for (let i = 0; i < 3; i++) this.normals.push(...r.n);
  }

  /** Triangle with per-vertex (smooth) normals; normals follow their vertex if the winding is flipped. */
  triSmooth(a: V3, b: V3, c: V3, na: V3, nb: V3, nc: V3): void {
    const r = this.orient(a, b, c);
    if (!r) return;
    if (r.flip) {
      this.positions.push(...a, ...c, ...b);
      this.normals.push(...na, ...nc, ...nb);
    } else {
      this.positions.push(...a, ...b, ...c);
      this.normals.push(...na, ...nb, ...nc);
    }
  }

  quad(a: V3, b: V3, c: V3, d: V3): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  /** Closed fan from a centre point to a ring. */
  fan(center: V3, ring: V3[]): void {
    for (let i = 0; i < ring.length; i++) this.tri(center, ring[i], ring[(i + 1) % ring.length]);
  }

  /** Closed strip between two rings with the same point count (index-aligned). */
  strip(upper: V3[], lower: V3[]): void {
    const n = upper.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.quad(upper[i], upper[j], lower[j], lower[i]);
    }
  }

  toGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

export interface RingPt {
  /** outline parameter in [0, 1) */
  t: number;
  p: V3;
}

/** Triangulates between two closed rings with different point counts, walking both by outline parameter. */
export function joinRings(mesh: FacetMesh, a: RingPt[], b: RingPt[]): void {
  const n = a.length;
  const m = b.length;
  const ta = (k: number) => a[k % n].t + Math.floor(k / n);
  const tb = (k: number) => b[k % m].t + Math.floor(k / m);
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    const advanceA = j >= m || (i < n && ta(i + 1) <= tb(j + 1));
    if (advanceA) {
      mesh.tri(a[i % n].p, a[(i + 1) % n].p, b[j % m].p);
      i++;
    } else {
      mesh.tri(a[i % n].p, b[(j + 1) % m].p, b[j % m].p);
      j++;
    }
  }
}

/** Sorted unique parameters in [0,1). */
export function uniqueParams(ts: number[]): number[] {
  const norm = ts.map((t) => ((t % 1) + 1) % 1).sort((x, y) => x - y);
  const out: number[] = [];
  for (const t of norm) if (out.length === 0 || t - out[out.length - 1] > 1e-7) out.push(t);
  if (out.length > 1 && 1 - out[out.length - 1] + out[0] < 1e-7) out.pop();
  return out;
}

/** Index of the parameter in `ts` closest to `t` (cyclic). */
export function nearestIndex(ts: number[], t: number): number {
  let best = 0;
  let bd = Infinity;
  ts.forEach((v, i) => {
    const d = Math.min(Math.abs(v - t), 1 - Math.abs(v - t));
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}
