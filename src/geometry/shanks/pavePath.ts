/**
 * Pave / accent stones that follow any path: the shared machinery behind pave on split, bypass, crossover, twisted and
 * the shoulder stones on a cathedral's arches. A strand is a polyline of frames (point on the outer surface, unit
 * tangent, outward normal); stones are laid along it at a fixed pitch, each lying flat on the surface with its table
 * outward, and tiny holding beads sit between neighbours.
 */
import * as THREE from 'three';
import type { BuiltStone, ShankCtx } from '../types';
import { accentDims, accentSize, bool, clamp, fromTop, headHalfAngle, num, smooth, str } from './common';

export interface PathFrame {
  /** point on the strand's outer surface, on its centre line */
  p: THREE.Vector3;
  /** unit tangent */
  tan: THREE.Vector3;
  /** unit outward normal, perpendicular to tan */
  up: THREE.Vector3;
}

export class Strand {
  readonly cum: number[] = [0];
  constructor(readonly frames: PathFrame[]) {
    for (let i = 1; i < frames.length; i++)
      this.cum.push(this.cum[i - 1] + frames[i].p.distanceTo(frames[i - 1].p));
  }
  get length(): number {
    return this.cum[this.cum.length - 1];
  }
  /** frame at arc length s (linear between samples) */
  at(s: number): PathFrame {
    const f = this.frames;
    const x = clamp(s, 0, this.length);
    let lo = 0;
    let hi = f.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= x) lo = mid;
      else hi = mid;
    }
    const span = this.cum[hi] - this.cum[lo] || 1;
    const k = (x - this.cum[lo]) / span;
    const tan = new THREE.Vector3().lerpVectors(f[lo].tan, f[hi].tan, k).normalize();
    const up0 = new THREE.Vector3().lerpVectors(f[lo].up, f[hi].up, k);
    const up = up0.addScaledVector(tan, -up0.dot(tan)).normalize();
    return { p: new THREE.Vector3().lerpVectors(f[lo].p, f[hi].p, k), tan, up };
  }
}

/** Build a strand from surface points; `upHint(i)` is an approximate outward direction, made perpendicular to the path. */
export function strandFrom(points: THREE.Vector3[], upHint: (i: number) => THREE.Vector3): Strand {
  const frames: PathFrame[] = points.map((p, i) => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    const tan = new THREE.Vector3().subVectors(b, a).normalize();
    const h = upHint(i).clone();
    const up = h.addScaledVector(tan, -h.dot(tan)).normalize();
    return { p: p.clone(), tan, up };
  });
  return new Strand(frames);
}

/** A strand over theta in [from, to] (either direction) of a centre line r(theta), z(theta) lying on the ring. */
export function ringStrand(
  from: number,
  to: number,
  r: (th: number) => number,
  z: (th: number) => number,
  n = 60,
): Strand {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const th = from + ((to - from) * i) / n;
    pts.push(new THREE.Vector3(r(th) * Math.cos(th), r(th) * Math.sin(th), z(th)));
  }
  return strandFrom(pts, (i) => {
    const th = from + ((to - from) * i) / n;
    return new THREE.Vector3(Math.cos(th), Math.sin(th), 0);
  });
}

/** Orientation of a stone lying on a frame: length along the path, table along the normal, sunk by `sink`. */
export function stoneMatrix(f: PathFrame, sink: number, lateral = 0): THREE.Matrix4 {
  const z = new THREE.Vector3().crossVectors(f.tan, f.up).normalize();
  const m = new THREE.Matrix4().makeBasis(f.tan, f.up, z);
  const pos = f.p.clone().addScaledVector(f.up, -sink).addScaledVector(z, lateral);
  m.setPosition(pos);
  return m;
}

export interface PaveSpec {
  built: BuiltStone;
  dims: { length: number; width: number; depth: number };
  /** half width of the bright-cut trough */
  g: number;
  bevel: number;
  /** trough depth */
  d: number;
  /** minimum metal width so a polished rim stays either side of the bright cut */
  need: number;
  pitch: number;
  beadR: number;
  beadU: number;
  /** how far below the surface the bead centres sit (more on strongly curved strands) */
  beadSink: number;
  /** crown height */
  ch: number;
  coverage: number;
}

/** Read the shared accent controls (`stoneSizeMm`, `stoneGapMm`, `coverage`) and resolve the stone for a pave run. */
export function paveSpec(
  ctx: ShankCtx,
  o: { min?: number; max?: number; rim?: number; coverage?: number } = {},
): PaveSpec {
  const p = ctx.params;
  const size = accentSize(ctx, p, o.min ?? 0.8, o.max ?? 1.8);
  const dims = accentDims(ctx, size);
  const built = ctx.stone(ctx.accent.cut.id, dims, { detail: 'low' });
  const gap = num(p, 'stoneGapMm', 0.08, 0, 0.6);
  const ch = built.crownHeight;
  const g = dims.width / 2 + 0.03;
  const bevel = clamp(dims.width * 0.22, 0.18, 0.35);
  const d = ch * 0.65 + 0.06;
  const need = 2 * (g + bevel + (o.rim ?? 0.14));
  return {
    built,
    dims,
    g,
    bevel,
    d,
    need,
    pitch: dims.length + gap,
    // small beads: they only need to catch the girdles, not frame each stone
    beadR: clamp(dims.width * 0.14, 0.1, 0.22),
    beadU: (dims.width / 2) * 0.78,
    beadSink: ch * 0.35,
    ch,
    coverage: num(p, 'coverage', o.coverage ?? 0.45, 0.1, 1),
  };
}

/** Is the pave toggle on? */
export function paveOn(ctx: ShankCtx, key = 'pave'): boolean {
  return bool(ctx.params, key, false);
}

export interface PaveRun {
  stones: THREE.Matrix4[];
  beads: THREE.Matrix4[];
  count: number;
}

/**
 * Lay stones along `strand` from arc length s0 to s1 (whatever fits at the spec's pitch), centred in that range.
 * `keep` can reject a position (for example where the strand dives under another one).
 */
export function paveAlong(
  strand: Strand,
  spec: PaveSpec,
  s0 = 0,
  s1 = strand.length,
  keep: (f: PathFrame) => boolean = () => true,
): PaveRun {
  const count = Math.max(0, Math.floor((s1 - s0) / spec.pitch));
  const used = count * spec.pitch;
  const start = s0 + (s1 - s0 - used) / 2;
  const stones: THREE.Matrix4[] = [];
  const beads: THREE.Matrix4[] = [];
  let kept = 0;
  for (let i = 0; i <= count; i++) {
    const sb = start + i * spec.pitch;
    const fb = strand.at(sb);
    if (keep(fb)) for (const side of [-1, 1]) beads.push(stoneMatrix(fb, spec.beadSink, side * spec.beadU));
    if (i < count) {
      const f = strand.at(sb + spec.pitch / 2);
      if (keep(f)) {
        stones.push(stoneMatrix(f, spec.ch * 0.7));
        kept++;
      }
    }
  }
  return { stones, beads, count: kept };
}

/**
 * `geometry.userData` key of a stone part's own body colour (#rrggbb). The assembler gives such a part its own gem
 * material (the slot's gem in that colour) instead of the slot's colour; graded pave uses it for each colour step.
 */
export const GEM_HEX = 'gemHex';

/** Graded pave: stones change size and/or colour step by step from the head outward. */
export interface PaveGrade {
  /** size of the outermost stone relative to the one next to the head (1 = no size grade) */
  to: number;
  /** body colour of the outermost stone (undefined = no colour grade) */
  colorHex?: string;
}

/**
 * Read the grading controls: `grade` (none | size | color | both), `gradeTo` (outer stone size ratio) and
 * `gradeColor` (a colour id of the accent gem, e.g. black or salt-and-pepper). Off by default.
 */
export function paveGrade(ctx: ShankCtx): PaveGrade {
  const p = ctx.params;
  const g = str(p, 'grade', ['none', 'size', 'color', 'both'] as const, 'none');
  const size = g === 'size' || g === 'both';
  const color = g === 'color' || g === 'both';
  const target = color
    ? ctx.accent.gem.colors.find((c) => c.id === String(p.gradeColor ?? 'black'))
    : undefined;
  return {
    to: size ? num(p, 'gradeTo', 0.8, 0.4, 1.6) : 1,
    colorHex:
      target && target.hex.toLowerCase() !== ctx.accent.colorHex.toLowerCase() ? target.hex : undefined,
  };
}

/** Mix two #rrggbb colours in sRGB (so the middle of white to black reads as a mid grey), k in 0..1. */
export function mixHex(a: string, b: string, k: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  let out = '#';
  for (let i = 0; i < 3; i++)
    out += Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * clamp(k, 0, 1))
      .toString(16)
      .padStart(2, '0');
  return out;
}

/**
 * Size factors (relative to the largest stone) of the most stones of length `len` plus `gap` that fit in `span` when
 * they grade linearly in size from 1 at the head to `to` at the far end.
 */
export function gradedScales(span: number, len: number, gap: number, to: number): number[] {
  const big = Math.max(1, to);
  const scales = (n: number) =>
    Array.from({ length: n }, (_, i) => (1 + (to - 1) * (n > 1 ? i / (n - 1) : 0)) / big);
  let best: number[] = [];
  for (let n = 1; n < 400; n++) {
    const s = scales(n);
    if (s.reduce((acc, k) => acc + len * k + gap, 0) > span + 1e-9) break;
    best = s;
  }
  return best;
}

/** Smooth 0..1 weight that is 1 between angles a0 and a1 from the top and fades over `fade` radians outside. */
export function zoneWeight(a0: number, a1: number, fade = 0.06): (th: number) => number {
  return (th) => {
    const dd = fromTop(th);
    return smooth((dd - (a0 - 0.08)) / fade) * smooth((a1 - dd) / fade);
  };
}

/** Angular range from the edge of the head to `coverage` of a half circle, and the head edge itself. */
export function paveZone(ctx: ShankCtx, spec: PaveSpec, rOut: number, maxEnd = Math.PI): [number, number] {
  const a0 = headHalfAngle(ctx, rOut) + 0.02;
  const a1 = clamp(spec.coverage * Math.PI, a0, maxEnd);
  return [a0, a1];
}
