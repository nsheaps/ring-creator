import type { CutModel, GemModel, StoneSpec } from './types';

export interface StoneDims {
  /** mm, longest side of the girdle outline (along local X). */
  length: number;
  /** mm, across (along local Z). */
  width: number;
  /** mm, table to culet (along local Y). */
  depth: number;
}

/** Solve L from carat: ct = vf * L * W * D * SG/3.52, with W = L/aspect and D = depthPct * W. */
export function dimsFromCarat(cut: CutModel, gem: GemModel, spec: Pick<StoneSpec, 'carat' | 'aspect' | 'depthPct'>): StoneDims {
  const a = spec.aspect ?? cut.defaultAspect;
  const d = spec.depthPct ?? cut.defaultDepthPct;
  const sg = gem.density;
  const L = Math.cbrt((spec.carat * 3.52 * a * a) / (cut.volumeFactor * d * sg));
  const W = L / a;
  return { length: L, width: W, depth: d * W };
}

/** US ring size to inner diameter in mm (standard: d = 11.63 + 0.8128 * size). */
export function innerDiameterMm(sizeUS: number): number {
  return 11.63 + 0.8128 * sizeUS;
}
