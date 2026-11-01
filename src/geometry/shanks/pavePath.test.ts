import { describe, expect, it } from 'vitest';
import '@/models/data';
import '@/geometry';
import { buildStone, resolveAccent } from '@/geometry/assemble';
import { getModel } from '@/models/registry';
import type { Params } from '@/models/types';
import type { ResolvedStone, ShankCtx } from '../types';
import { gradedScales, mixHex, paveGrade, paveSpec } from './pavePath';

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

describe('pave grading helpers', () => {
  it('is off unless asked for, and ignores a grade colour the accent gem does not have', () => {
    expect(paveGrade(ctx({}))).toEqual({ to: 1, colorHex: undefined });
    expect(paveGrade(ctx({ grade: 'size', gradeTo: 0.7 }))).toEqual({ to: 0.7, colorHex: undefined });
    expect(paveGrade(ctx({ grade: 'color', gradeColor: 'black' })).colorHex).toBe('#1b1b1f');
    expect(paveGrade(ctx({ grade: 'color', gradeColor: 'no-such-colour' })).colorHex).toBeUndefined();
  });

  it('mixes colours in sRGB: half way from white to black is a mid grey', () => {
    expect(mixHex('#ffffff', '#000000', 0)).toBe('#ffffff');
    expect(mixHex('#ffffff', '#000000', 0.5)).toBe('#808080');
    expect(mixHex('#ffffff', '#000000', 1)).toBe('#000000');
  });

  it('fits as many graded stones as the span allows, tapering linearly from the head', () => {
    const k = gradedScales(20, 1.3, 0.08, 0.6);
    expect(k[0]).toBe(1);
    expect(k[k.length - 1]).toBeCloseTo(0.6, 9);
    const used = k.reduce((a, x) => a + 1.3 * x + 0.08, 0);
    expect(used).toBeLessThanOrEqual(20);
    // one more stone would not fit
    const more = gradedScales(20 + 1.3 * 0.6, 1.3, 0.08, 0.6).length;
    expect(more).toBeGreaterThanOrEqual(k.length);
    // growing outward: scales are relative to the largest (outermost) stone
    const up = gradedScales(20, 1.3, 0.08, 1.5);
    expect(up[up.length - 1]).toBeCloseTo(1, 9);
    expect(up[0]).toBeCloseTo(1 / 1.5, 9);
  });
});
