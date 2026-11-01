import { describe, expect, it } from 'vitest';
import { headBuilders } from '../builders';
import type { BuiltStone, Part, StoneBuildOptions } from '../types';
import type { StoneDims } from '@/models/stoneMath';
import type { Params } from '@/models/types';
import { heads } from '@/models/data/heads';
import { getModel } from '@/models/registry';
import '@/models/data';
import { buildStoneByCut } from '../stones';
import './index';
import { stubCtx } from './testStub';

type Axis = [number, number];

/** Build a multi-stone head with real side-stone geometry (stub centre), recording every stone it asks for. */
function build(
  id: 'three-stone' | 'five-stone',
  params: Params,
  bandAxis: Axis = [1, 0],
  accentCut = 'baguette',
) {
  const model = heads.find((h) => h.id === id);
  if (!model) throw new Error(id);
  const fn = headBuilders.get(model.builder);
  if (!fn) throw new Error(model.builder);
  const base = stubCtx({ cut: 'round-brilliant', params: { ...model.params, ...params }, bandAxis });
  const calls: string[] = [];
  const ctx = {
    ...base,
    accent: { ...base.accent, cut: getModel('cut', accentCut) },
    stone: (cutId: string, dims: StoneDims, opts?: StoneBuildOptions): BuiltStone => {
      calls.push(cutId);
      return buildStoneByCut(getModel('cut', cutId), dims, opts);
    },
  };
  return { parts: fn(ctx), calls };
}

/** Accent vertices as (u along the band, v across it, y). */
function accentUV(parts: Part[], [ax, az]: Axis): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const p of parts.filter((q) => q.slot === 'accent-stone')) {
    const pos = p.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      out.push([x * ax + z * az, -x * az + z * ax, pos.getY(i)]);
    }
  }
  return out;
}

const range = (xs: number[]) => Math.max(...xs) - Math.min(...xs);

describe('multi-stone heads: per-position cuts', () => {
  it('three-stone has no outer stones by default and adds one per side with an outer cut', () => {
    const plain = build('three-stone', { sideCut: 'baguette' });
    expect(plain.calls).toEqual(['baguette', 'baguette']);
    const outer = build('three-stone', { sideCut: 'baguette', outerCut: 'trillion' });
    expect(outer.calls).toEqual(['baguette', 'trillion', 'baguette', 'trillion']);
    const uPlain = accentUV(plain.parts, [1, 0]).map((p) => p[0]);
    const uOuter = accentUV(outer.parts, [1, 0]).map((p) => p[0]);
    expect(Math.max(...uOuter)).toBeGreaterThan(Math.max(...uPlain) + 1);
    expect(Math.min(...uOuter)).toBeLessThan(Math.min(...uPlain) - 1);
  });

  it('five-stone repeats the side cut by default and takes its own outer cut', () => {
    expect(build('five-stone', {}).calls).toEqual(['baguette', 'baguette', 'baguette', 'baguette']);
    expect(build('five-stone', { outerCut: 'trillion' }).calls).toEqual([
      'baguette',
      'trillion',
      'baguette',
      'trillion',
    ]);
  });

  it('an unknown cut id falls back to the accent cut', () => {
    expect(build('three-stone', { sideCut: 'no-such-cut' }).calls).toEqual(['baguette', 'baguette']);
  });
});

describe('multi-stone heads: side stone orientation', () => {
  for (const axis of [
    [1, 0],
    [0, 1],
  ] as Axis[]) {
    it(`baguettes stand along the finger, across the band (band axis ${axis.join(',')})`, () => {
      const { parts } = build('three-stone', { sideCut: 'baguette' }, axis);
      const right = accentUV(parts, axis).filter((p) => p[0] > 0);
      expect(right.length).toBeGreaterThan(0);
      const along = range(right.map((p) => p[0]));
      const across = range(right.map((p) => p[1]));
      expect(across).toBeGreaterThan(along * 1.4);
    });

    it(`trillions point away from the centre with a flat side towards it (band axis ${axis.join(',')})`, () => {
      const { parts } = build('three-stone', { sideCut: 'trillion' }, axis, 'trillion');
      for (const sign of [-1, 1]) {
        // girdle-level vertices of the stone on this side, u measured outward from the centre
        const pts = accentUV(parts, axis)
          .filter((p) => p[0] * sign > 0)
          .map((p) => [p[0] * sign, p[1]] as const);
        const u = pts.map((p) => p[0]);
        const lo = Math.min(...u);
        const hi = Math.max(...u);
        const span = hi - lo;
        const width = range(pts.map((p) => p[1]));
        const near = pts.filter((p) => p[0] < lo + span * 0.15).map((p) => p[1]);
        const far = pts.filter((p) => p[0] > hi - span * 0.15).map((p) => p[1]);
        // the flat side (nearest the centre) is wide; the apex (furthest out) is a point on the centre line
        expect(range(near)).toBeGreaterThan(width * 0.6);
        expect(range(far)).toBeLessThan(width * 0.3);
        expect(Math.abs(far.reduce((s, v) => s + v, 0) / far.length)).toBeLessThan(width * 0.1);
      }
    });
  }
});
