import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { gems } from '@/models/data/gems';
import { DARK_GEM_MIN_LIGHTNESS, SPECKLED_MIN_LIGHTNESS, gemMaterials, gemShade } from './materials';
import { gemColorFlashes } from '@/models/data/gems';

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

describe('salt-and-pepper diamond', () => {
  it('is a translucent mid-grey with inclusion speckles, not a dark stone', () => {
    for (const g of ['diamond', 'lab-diamond']) {
      const s = gemShade(gem(g), hex(g, 'salt-and-pepper'), undefined, undefined, 0, true);
      expect(s.darkness).toBe(0);
      expect(s.speckle).toBe(1);
      expect(srgbL(s.body)).toBeGreaterThanOrEqual(SPECKLED_MIN_LIGHTNESS - 0.01);
      expect(srgbL(s.body)).toBeLessThan(0.8);
      // light passes the grey body: far brighter than the old near-black (body^1.4 of #8d8f93 is ~0.16)
      expect(bodyAfterPath(s)).toBeGreaterThan(0.25);
      expect(s.darkFloor).toBeGreaterThan(1);
      // still grey, not a tinted stone
      const hsl = { h: 0, s: 0, l: 0 };
      s.body.getHSL(hsl, THREE.SRGBColorSpace);
      expect(hsl.s).toBeLessThan(0.1);
    }
  });

  it.each([
    ['diamond', 'colorless'],
    ['diamond', 'black'],
    ['moissanite', 'gray'],
    ['sapphire', 'blue'],
  ])('%s %s has no speckles', (g, c) => {
    const s = gemShade(gem(g), hex(g, c));
    expect(s.speckle).toBe(0);
    expect(s.darkFloor).toBe(1);
  });
});

describe('inclusion shader', () => {
  /** run a material's onBeforeCompile against a minimal stand-in of three's shader chunks */
  const compile = (m: THREE.Material) => {
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}',
      fragmentShader: '#include <common>\nvoid main() {\n#include <opaque_fragment>\n}',
    } as unknown as THREE.WebGLProgramParametersWithUniforms;
    m.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    return shader;
  };

  it('evaluates clustered noise clouds in the stone frame in both passes', () => {
    const [outer, inner] = gemMaterials(
      gem('diamond'),
      hex('diamond', 'salt-and-pepper'),
      undefined,
      undefined,
      0,
      true,
      false,
    );
    for (const m of [outer, inner]) {
      const s = compile(m);
      // local (object-space) position and view ray: inclusions stay put while the camera or ring turns
      expect(s.vertexShader).toContain('vGemLocal = position;');
      expect(s.vertexShader).toContain('#include <begin_vertex>');
      expect(s.fragmentShader).toContain('gemFbm');
      expect(s.fragmentShader).toContain('gemCloud( q )');
      expect(s.fragmentShader).toContain('gemSpeck(');
      // deterministic: no time or random inputs
      expect(s.fragmentShader).not.toMatch(/\btime\b|random\(/);
      expect(s.uniforms).toHaveProperty('gemSpeckleAmt');
    }
  });

  it('speckled stones keep depth: dimmer than a colourless stone, with a dark-leaning mosaic floor', () => {
    const sp = gemShade(gem('diamond'), hex('diamond', 'salt-and-pepper'), undefined, undefined, 0, true);
    const cl = gemShade(gem('diamond'), hex('diamond', 'colorless'), undefined, undefined, 0, true);
    expect(sp.brightness).toBeLessThan(cl.brightness);
    expect(sp.contrast).toBeGreaterThan(0);
  });
});

describe('colour flashes (parti stones)', () => {
  it('every flash entry names a real gem colour', () => {
    for (const k of Object.keys(gemColorFlashes)) {
      const [g, c] = k.split('/');
      expect(() => hex(g ?? '', c ?? '')).not.toThrow();
    }
  });

  it('teal sapphire faces up green (green channel leads blue) with blue-green flashes', () => {
    const s = gemShade(gem('sapphire'), hex('sapphire', 'teal'));
    expect(s.body.g).toBeGreaterThan(s.body.b * 2);
    expect(s.body.g).toBeGreaterThan(s.body.r);
    expect(s.flashMix).toBe(1);
    expect(s.body2.b).toBeGreaterThan(s.body.b);
    expect(s.body2.equals(s.body)).toBe(false);
  });

  it('one-colour stones have no flash', () => {
    const s = gemShade(gem('sapphire'), hex('sapphire', 'blue'));
    expect(s.flashMix).toBe(0);
    expect(s.body2.equals(s.body)).toBe(true);
  });

  it('green sapphire reads green, not cyan', () => {
    const s = gemShade(gem('sapphire'), hex('sapphire', 'green'));
    const hsl = { h: 0, s: 0, l: 0 };
    s.body.getHSL(hsl);
    expect(hsl.h * 360).toBeGreaterThan(90);
    expect(hsl.h * 360).toBeLessThan(160);
  });
});

describe('self-lit crowns (accent and pave stones)', () => {
  it('is off unless asked for', () => {
    expect(gemShade(gem('diamond'), hex('diamond', 'colorless')).self).toBe(0);
  });
  it('turns on for accent stones', () => {
    const s = gemShade(gem('diamond'), hex('diamond', 'colorless'), undefined, undefined, 0, false, true);
    expect(s.self).toBe(1);
    // the rest of the shading is unchanged: colourless stays white
    const plain = gemShade(gem('diamond'), hex('diamond', 'colorless'));
    expect(s.body.equals(plain.body)).toBe(true);
    expect(s.brightness).toBe(plain.brightness);
  });
});
