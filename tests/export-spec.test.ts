import { describe, expect, it } from 'vitest';
import '@/models/data';
import { exampleDesigns } from '@/models/data/examples';
import { defaultDesign } from '@/state/defaults';
import { bomCsv, bomRows } from '@/export/bom';
import { computeSpec } from '@/export/spec';
import { components, signedVolume } from '@/export/meshMath';
import { dwtToGrams, gramsToDwt, mm3ToCarats, mm3ToGrams, ringSize, ringSizeTable } from '@/export/units';
import { jewelerNotes } from '@/export/notes';
import type { Design } from '@/models/types';

/** Closed unit-orientation cube [0,s]^3 as a triangle soup (outward normals). */
function cube(s: number, dx = 0): Float32Array {
  const v = (x: number, y: number, z: number) => [x * s + dx, y * s, z * s];
  const quads = [
    [v(0, 0, 0), v(0, 1, 0), v(1, 1, 0), v(1, 0, 0)],
    [v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)],
    [v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1)],
    [v(0, 1, 0), v(0, 1, 1), v(1, 1, 1), v(1, 1, 0)],
    [v(0, 0, 0), v(0, 0, 1), v(0, 1, 1), v(0, 1, 0)],
    [v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), v(1, 0, 1)],
  ];
  const out: number[] = [];
  for (const [a, b, c, d] of quads) out.push(...a, ...b, ...c, ...a, ...c, ...d);
  return new Float32Array(out);
}

describe('units', () => {
  it('converts grams and pennyweights', () => {
    expect(gramsToDwt(31.1034768)).toBeCloseTo(20, 6);
    expect(dwtToGrams(1)).toBeCloseTo(1.55517384, 8);
    expect(gramsToDwt(dwtToGrams(3.7))).toBeCloseTo(3.7, 10);
  });
  it('converts volume to weight and carats', () => {
    expect(mm3ToGrams(1000, 19.3)).toBeCloseTo(19.3, 10);
    // 1 ct diamond is ~56.8 mm³ (0.2 g / 3.52 g/cm³)
    expect(mm3ToCarats(56.818, 3.52)).toBeCloseTo(1, 3);
  });
  it('maps US ring sizes to inner diameter and circumference', () => {
    expect(ringSize(7).diameterMm).toBeCloseTo(17.32, 2);
    expect(ringSize(7).circumferenceMm).toBeCloseTo(54.41, 1);
    expect(ringSize(5).diameterMm).toBeCloseTo(15.69, 2);
    expect(ringSize(10).diameterMm).toBeCloseTo(19.76, 2);
    const t = ringSizeTable();
    expect(t[0].us).toBe(3);
    expect(t[t.length - 1].us).toBe(13);
    expect(t).toHaveLength(21);
    for (let i = 1; i < t.length; i++) expect(t[i].diameterMm).toBeGreaterThan(t[i - 1].diameterMm);
  });
});

describe('mesh math', () => {
  it('measures signed volume and splits components', () => {
    expect(signedVolume(cube(2))).toBeCloseTo(8, 6);
    const two = new Float32Array([...cube(1), ...cube(2, 5)]);
    const comps = components(two);
    expect(comps).toHaveLength(2);
    expect(comps.map((c) => c.volume).sort((a, b) => a - b)).toEqual([
      expect.closeTo(1, 6),
      expect.closeTo(8, 6),
    ]);
  });
});

function withMetal(d: Design, metal: string): Design {
  const c = structuredClone(d);
  c.engagement.head.metal = metal;
  c.engagement.shank.metal = metal;
  if (c.band) c.band.metal = c.band.metal2 = metal;
  return c;
}

describe('computeSpec', () => {
  const d = defaultDesign();

  it('gives plausible dimensions and weights for the default ring', () => {
    const s = computeSpec(d, 'engagement');
    expect(s.pieces).toHaveLength(1);
    const p = s.pieces[0];
    expect(p.palmThicknessMm).toBeGreaterThan(1);
    expect(p.palmThicknessMm).toBeLessThan(3.5);
    expect(p.palmWidthMm).toBeGreaterThan(1);
    expect(p.palmWidthMm).toBeLessThan(8);
    expect(p.headHeightMm).toBeGreaterThan(3);
    expect(p.headHeightMm).toBeLessThan(15);
    // A gold or platinum solitaire weighs a few grams.
    expect(s.totals.metalGrams).toBeGreaterThan(1);
    expect(s.totals.metalGrams).toBeLessThan(15);
    expect(s.totals.metalDwt).toBeCloseTo(s.totals.metalGrams / 1.55517384, 6);
    // Center stone volume x SG is within 15 % of the specified carat.
    expect(s.center).not.toBeNull();
    expect(Math.abs(s.center!.meshCarat - s.center!.carat) / s.center!.carat).toBeLessThan(0.15);
    expect(s.size.diameterMm).toBeCloseTo(11.63 + 0.8128 * d.ringSizeUS, 6);
  });

  it('scales weight with metal density', () => {
    const plat = computeSpec(withMetal(d, 'platinum'), 'engagement').totals.metalGrams;
    const ti = computeSpec(withMetal(d, 'titanium'), 'engagement').totals.metalGrams;
    expect(plat / ti).toBeCloseTo(21.4 / 4.5, 1);
  });

  it('covers both pieces for a set and breaks down mixed metals', () => {
    const mixed = structuredClone(d);
    mixed.engagement.head.metal = 'white-gold-14k';
    mixed.engagement.shank.metal = 'yellow-gold-14k';
    const s = computeSpec(mixed, 'set');
    if (mixed.band) {
      expect(s.pieces.map((p) => p.piece)).toEqual(['engagement', 'band']);
      expect(s.pieces[1].metalGrams).toBeGreaterThan(0.5);
    }
    expect(s.mixedMetal).toBe(true);
    const ids = s.metals.map((m) => `${m.role}:${m.metalId}`);
    expect(ids).toContain('head:white-gold-14k');
    expect(ids).toContain('shank:yellow-gold-14k');
  });

  it('is deterministic', () => {
    expect(JSON.stringify(computeSpec(d, 'set'))).toBe(JSON.stringify(computeSpec(d, 'set')));
  });

  it('counts accent stones on a halo example', () => {
    const halo = exampleDesigns.find(
      (x) => /halo/i.test(x.engagement.head.id) && !/hidden|secret/i.test(x.engagement.head.id),
    );
    expect(halo).toBeDefined();
    const s = computeSpec(halo!, 'engagement');
    const accents = s.stones.filter((x) => x.role === 'accent').reduce((a, x) => a + x.count, 0);
    expect(accents).toBeGreaterThan(8);
    for (const st of s.stones) {
      expect(st.caratEach).toBeGreaterThan(0);
      expect(st.lengthMm).toBeGreaterThan(0.3);
    }
  });

  it('builds a BOM and CSV with one row per metal part and stone group', () => {
    const s = computeSpec(d, 'set');
    const rows = bomRows(s);
    expect(rows).toHaveLength(s.metals.length + s.stones.length);
    const csv = bomCsv(s).trimEnd().split('\r\n');
    expect(csv[0]).toBe('item,piece,material,description,qty,size,each,total,unit,dwt');
    expect(csv).toHaveLength(rows.length + 1);
    expect(csv.some((l) => l.startsWith('Center stone'))).toBe(true);
  });

  it('writes jeweler notes for every section', () => {
    const s = computeSpec(d, 'set');
    const titles = jewelerNotes(d, s).map((x) => x.title);
    for (const t of ['Sizing', 'Tolerances', 'Center stone seat', 'Casting and metal', 'Finish', 'Engraving'])
      expect(titles).toContain(t);
  });
});
