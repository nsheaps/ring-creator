import { describe, expect, it } from 'vitest';
import { clarities } from './clarities';
import { colorGrades } from './colorGrades';
import { finishes } from './finishes';
import { gems } from './gems';
import { metals } from './metals';
import type { ModelBase } from '../types';

const HEX = /^#[0-9a-f]{6}$/i;

const vocabMetals = [
  'yellow-gold-14k', 'yellow-gold-18k', 'white-gold-14k', 'white-gold-18k', 'rose-gold-14k', 'rose-gold-18k',
  'platinum', 'palladium', 'sterling-silver', 'titanium', 'tungsten', 'black-zirconium', 'tantalum',
];
const vocabFinishes = ['polished', 'satin', 'matte', 'hammered', 'sandblasted', 'brushed', 'engraved', 'milgrain'];
const vocabGems = [
  'diamond', 'lab-diamond', 'moissanite', 'sapphire', 'ruby', 'emerald', 'aquamarine', 'morganite', 'alexandrite',
  'tanzanite', 'spinel', 'tourmaline', 'garnet', 'opal', 'peridot', 'topaz', 'amethyst', 'citrine', 'zircon', 'pearl', 'onyx',
];
const vocabOther = [
  // cuts
  'round-brilliant', 'princess', 'cushion', 'oval', 'emerald-cut', 'asscher', 'radiant', 'pear', 'marquise', 'heart',
  'trillion', 'baguette', 'rose-cut', 'old-european', 'hexagon', 'kite', 'shield', 'cabochon',
  // heads
  'solitaire-4-prong', 'solitaire-6-prong', '3-prong', 'double-claw', 'basket', 'cathedral-head', 'v-prong', 'bezel-full',
  'bezel-half', 'halo-round', 'halo-cushion', 'halo-oval', 'hidden-halo', 'double-halo', 'three-stone', 'five-stone',
  'cluster', 'trellis', 'tension', 'flush-gypsy', 'split-prong', 'compass', 'vintage-filigree', 'toi-et-moi', 'bypass-head',
  // shanks
  'plain-round', 'plain-flat', 'knife-edge', 'tapered', 'cathedral', 'split', 'pave', 'channel', 'twisted', 'bypass',
  'milgrain', 'crossover', 'wide', 'dainty', 'hammered', 'braided', 'leaf-vine', 'twig',
];

const all: ModelBase[] = [...metals, ...finishes, ...gems, ...clarities, ...colorGrades];
const allIds = new Set<string>([...all.map((m) => m.id), ...vocabOther]);

function unique(ids: string[]): boolean {
  return new Set(ids).size === ids.length;
}

describe('materials data', () => {
  it('has unique ids per kind', () => {
    for (const list of [metals, finishes, gems, clarities, colorGrades]) {
      expect(unique(list.map((m) => m.id))).toBe(true);
    }
  });

  it('covers every vocabulary id', () => {
    const ids = (l: ModelBase[]) => l.map((m) => m.id);
    for (const id of vocabMetals) expect(ids(metals)).toContain(id);
    for (const id of vocabFinishes) expect(ids(finishes)).toContain(id);
    for (const id of vocabGems) expect(ids(gems)).toContain(id);
    for (const id of ['yellow-gold-10k', 'white-gold-10k', 'rose-gold-10k', 'green-gold-18k']) expect(ids(metals)).toContain(id);
    expect(ids(clarities)).toEqual(['fl', 'if', 'vvs1', 'vvs2', 'vs1', 'vs2', 'si1', 'si2', 'i1', 'i2']);
    expect(ids(colorGrades)).toEqual(['d-f', 'g-j', 'k-m', 'n-r', 's-z']);
  });

  it('has complete base fields and resolvable related ids', () => {
    for (const m of all) {
      expect(m.summary.length).toBeGreaterThan(10);
      expect(m.description.split(/\s+/).length).toBeLessThan(130);
      expect(m.tags.length).toBeGreaterThan(0);
      for (const r of m.related ?? []) expect(allIds.has(r), `${m.id} -> ${r}`).toBe(true);
    }
  });

  it('gems: colors, default color and ranges', () => {
    for (const g of gems) {
      expect(g.colors.length).toBeGreaterThanOrEqual(4);
      expect(g.colors.length).toBeLessThanOrEqual(12);
      expect(unique(g.colors.map((c) => c.id))).toBe(true);
      expect(g.colors.map((c) => c.id)).toContain(g.defaultColor);
      for (const c of g.colors) {
        expect(c.hex).toMatch(HEX);
        expect(c.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      }
      expect(g.ior).toBeGreaterThan(1.3);
      expect(g.ior).toBeLessThan(2.8);
      expect(g.mohs).toBeGreaterThanOrEqual(1);
      expect(g.mohs).toBeLessThanOrEqual(10);
      expect(g.density).toBeGreaterThan(1.5);
      expect(g.density).toBeLessThan(5);
      expect(g.dispersion).toBeGreaterThanOrEqual(0);
      expect(g.dispersion).toBeLessThanOrEqual(0.2);
      expect(g.priceHintPerCaratUsd[0]).toBeLessThan(g.priceHintPerCaratUsd[1]);
    }
    const colorIds = (id: string) => gems.find((g) => g.id === id)?.colors.map((c) => c.id) ?? [];
    expect(colorIds('diamond')).toEqual(expect.arrayContaining([
      'colorless', 'near-colorless', 'faint-yellow', 'champagne', 'yellow', 'pink', 'blue', 'black', 'salt-and-pepper', 'green', 'orange', 'brown',
    ]));
    expect(colorIds('lab-diamond')).toEqual(colorIds('diamond'));
    expect(colorIds('sapphire')).toEqual(expect.arrayContaining([
      'blue', 'royal-blue', 'cornflower', 'pink', 'padparadscha', 'yellow', 'teal', 'white', 'purple', 'green', 'black',
    ]));
    expect(colorIds('emerald')).toEqual(expect.arrayContaining(['green', 'deep-green', 'bluish-green']));
    expect(colorIds('ruby')).toEqual(expect.arrayContaining(['red', 'pigeon-blood', 'pink-red']));
    expect(gems.find((g) => g.id === 'lab-diamond')?.lab).toBe(true);
    expect(gems.find((g) => g.id === 'diamond')?.lab).toBe(false);
  });

  it('metals: ranges', () => {
    for (const m of metals) {
      expect(m.color).toMatch(HEX);
      expect(m.roughness).toBeGreaterThanOrEqual(0.1);
      expect(m.roughness).toBeLessThanOrEqual(0.35);
      expect(m.metalness).toBeGreaterThanOrEqual(0.9);
      expect(m.metalness).toBeLessThanOrEqual(1);
      expect(m.density).toBeGreaterThan(4);
      expect(m.density).toBeLessThan(22);
      expect(m.mohs).toBeGreaterThan(1);
      expect(m.mohs).toBeLessThanOrEqual(9);
      expect(m.pricePerGramUsd).toBeGreaterThan(0);
      expect(m.maintenance.length).toBeGreaterThan(10);
    }
    const byId = (id: string) => metals.find((m) => m.id === id);
    expect(byId('platinum')?.hypoallergenic).toBe(true);
    expect(byId('white-gold-14k')?.hypoallergenic).toBe(false);
    expect(byId('platinum')?.density).toBe(21.4);
    expect(byId('yellow-gold-18k')!.pricePerGramUsd).toBeGreaterThan(byId('yellow-gold-14k')!.pricePerGramUsd);
  });

  it('finishes, clarities and color grades: ranges', () => {
    for (const f of finishes) {
      expect(f.roughnessAdd).toBeGreaterThanOrEqual(0);
      expect(f.roughnessAdd).toBeLessThanOrEqual(1);
      expect(f.bump).toBeGreaterThanOrEqual(0);
      expect(f.bump).toBeLessThanOrEqual(1);
    }
    clarities.forEach((cl, i) => {
      expect(cl.rank).toBe(i);
      expect(cl.code).toBe(cl.id.toUpperCase());
      expect(cl.haze).toBeGreaterThanOrEqual(0);
      expect(cl.haze).toBeLessThanOrEqual(1);
      if (i > 0) expect(cl.haze).toBeGreaterThanOrEqual(clarities[i - 1]!.haze);
    });
    for (const id of ['fl', 'if', 'vvs1', 'vvs2']) expect(clarities.find((c) => c.id === id)?.haze).toBe(0);
    expect(clarities.find((c) => c.id === 'i2')?.haze).toBeCloseTo(0.9);
    for (const id of ['fl', 'if', 'vvs1', 'vvs2', 'vs1', 'vs2', 'si1']) expect(clarities.find((c) => c.id === id)?.eyeClean).toBe(true);
    for (const id of ['si2', 'i1', 'i2']) expect(clarities.find((c) => c.id === id)?.eyeClean).toBe(false);
    colorGrades.forEach((g, i) => {
      expect(g.tint).toMatch(HEX);
      expect(g.tintStrength).toBeGreaterThanOrEqual(0);
      expect(g.tintStrength).toBeLessThanOrEqual(1);
      if (i > 0) expect(g.tintStrength).toBeGreaterThan(colorGrades[i - 1]!.tintStrength);
    });
  });
});
