import { describe, expect, it } from 'vitest';
import '@/models/data';
import '@/geometry';
import { buildStone, resolveAccent } from '@/geometry/assemble';
import { getModel } from '@/models/registry';
import type { Params } from '@/models/types';
import type { ResolvedStone, ShankCtx } from '../types';
import { paveSpec } from './pavePath';

function ctx(params: Params, sizeMm = 1.3): ShankCtx {
  return {
    innerRadius: 8.5,
    center: {} as ResolvedStone,
    accent: resolveAccent({ material: 'diamond', color: 'colorless', cut: 'round-brilliant', sizeMm }),
    params,
    headHalfAlongBand: 3.5,
    headHalfAlongFinger: 3.5,
    stone: (cutId, dims, opts) => buildStone(getModel('cut', cutId), dims, opts),
  };
}

describe('paveSpec', () => {
  it('spaces the stones by exactly stoneGapMm', () => {
    for (const gap of [0, 0.04, 0.3]) {
      const spec = paveSpec(ctx({ stoneGapMm: gap, stoneSizeMm: 1.3 }));
      expect(spec.pitch - spec.dims.length).toBeCloseTo(gap, 6);
    }
  });

  it('keeps the holding beads small next to the stones, so they do not open visible gaps', () => {
    for (const size of [0.9, 1.3, 1.6]) {
      const spec = paveSpec(ctx({ stoneSizeMm: size }));
      expect(spec.beadR).toBeLessThanOrEqual(Math.max(0.1, spec.dims.width * 0.14) + 1e-9);
    }
  });
});
