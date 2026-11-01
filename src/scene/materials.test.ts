import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { gems } from '@/models/data/gems';
import { DARK_GEM_MIN_LIGHTNESS, gemShade } from './materials';

const gem = (id: string) => {
  const g = gems.find((x) => x.id === id);
  if (!g) throw new Error(`no gem ${id}`);
  return g;
};
const hex = (gemId: string, colorId: string) => {
  const c = gem(gemId).colors.find((x) => x.id === colorId);
  if (!c) throw new Error(`no colour ${gemId}/${colorId}`);
  return c.hex;
};
/** linear body brightness after the shader's path-length power (what multiplies the environment) */
const bodyAfterPath = (s: ReturnType<typeof gemShade>) => {
  const b = s.body;
  return Math.max(b.r, b.g, b.b) ** s.path;
};
const srgbL = (c: THREE.Color) => {
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl, THREE.SRGBColorSpace);
  return hsl.l;
};

describe('gemShade', () => {
  const darkStones: [string, string][] = [
    ['diamond', 'black'],
    ['lab-diamond', 'black'],
    ['sapphire', 'black'],
    ['spinel', 'black'],
    ['tourmaline', 'black'],
  ];

  it.each(darkStones)('%s %s never clamps to black', (g, c) => {
    for (const stepCut of [false, true]) {
      const s = gemShade(gem(g), hex(g, c), undefined, undefined, 0, stepCut);
      expect(s.darkness).toBeGreaterThan(0.9);
      expect(srgbL(s.body)).toBeGreaterThanOrEqual(DARK_GEM_MIN_LIGHTNESS - 0.01);
      // linear 0.1 is roughly a mid-dark grey on screen; the old shading gave ~0.002 for a black diamond
      expect(bodyAfterPath(s)).toBeGreaterThan(0.1);
      expect(s.lift).toBeGreaterThan(0.2);
      expect(s.crownEnv).toBeGreaterThan(0.6);
    }
  });

  it('keeps step-cut banding on a dark emerald cut', () => {
    const s = gemShade(gem('diamond'), hex('diamond', 'black'), undefined, undefined, 0, true);
    expect(s.step).toBe(1);
    expect(s.mosaic).toBe(1);
    expect(s.dispersion).toBe(0);
  });

  it('stays a dark grey, not a white stone', () => {
    const s = gemShade(gem('diamond'), hex('diamond', 'black'));
    expect(srgbL(s.body)).toBeLessThan(0.5);
    const hsl = { h: 0, s: 0, l: 0 };
    s.body.getHSL(hsl, THREE.SRGBColorSpace);
    expect(hsl.s).toBeLessThan(0.1);
  });

  it.each([
    ['diamond', 'colorless'],
    ['diamond', 'salt-and-pepper'],
    ['ruby', 'red'],
    ['emerald', 'green'],
    ['sapphire', 'blue'],
    ['aquamarine', 'blue'],
  ])('leaves %s %s shading unchanged (no dark lift)', (g, c) => {
    const colour = gem(g).colors.find((x) => x.id === c) ?? gem(g).colors[0];
    if (!colour) throw new Error('no colour');
    const s = gemShade(gem(g), colour.hex);
    expect(s.darkness).toBe(0);
    expect(s.lift).toBeCloseTo(0.12);
    expect(s.crownEnv).toBeCloseTo(0.6);
  });

  it('only partly lifts deep but clearly coloured stones', () => {
    const s = gemShade(gem('emerald'), hex('emerald', 'deep-green'));
    expect(s.darkness).toBeLessThan(0.5);
    const hsl = { h: 0, s: 0, l: 0 };
    s.body.getHSL(hsl);
    expect(hsl.s).toBeGreaterThan(0.5);
  });
});
