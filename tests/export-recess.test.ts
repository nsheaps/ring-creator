/** The oxidised recess (slot `head-recess`): rendered dark, exported as its own part on the head's metal. */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import '@/models/data';
import { exampleDesigns } from '@/models/data/examples';
import { assembleDesign, disposeGroup, engagementParts, PART_SLOT } from '@/geometry/assemble';
import { collectParts } from '@/export/collect';
import { stlTriangleCount, toObj, toStl } from '@/export/mesh';
import { bomRows } from '@/export/bom';
import { computeSpec, OXIDISED_FINISH } from '@/export/spec';
import { triangleCount } from '@/export/meshMath';
import type { Design } from '@/models/types';

const r1013 = exampleDesigns.find((d) => d.id === 'r1-013');

/** The same design with the plaque's recess left bright. */
function bright(d: Design): Design {
  const out = structuredClone(d);
  out.engagement.head.params = { ...out.engagement.head.params, recessFinish: 'none' };
  return out;
}

const luminance = (m: THREE.Material) => {
  const c = (m as THREE.MeshStandardMaterial).color;
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

describe('oxidised recess', () => {
  it('r1-013 uses it', () => {
    expect(r1013).toBeDefined();
    expect(r1013!.engagement.head.id).toBe('deco-plaque');
    expect(r1013!.engagement.head.params?.recessFinish).toBe('oxidised');
  });

  it('the pierced well and its lining stay inside the plaque (nothing pokes out below it)', () => {
    const d = r1013!;
    const minY = (x: Design, slot: string, label?: string) => {
      let lo = Infinity;
      for (const p of engagementParts(x).parts.filter(
        (q) => q.slot === slot && (label === undefined || q.label === label),
      )) {
        const a = p.geometry.getAttribute('position');
        for (let i = 0; i < a.count; i++) lo = Math.min(lo, a.getY(i));
      }
      return lo;
    };
    const shallow = structuredClone(d);
    shallow.engagement.head.params = { ...shallow.engagement.head.params, pierceDepth: 0 };
    expect(minY(d, 'head-metal')).toBeCloseTo(minY(shallow, 'head-metal'), 4);
    expect(minY(d, 'head-recess', 'oxidised recess')).toBeGreaterThan(engagementParts(d).seatY);
    // the dark leaves of the filigree shoulder wings run down the shank, but lie on the wings' metal, never under it
    expect(minY(d, 'head-recess', 'oxidised wing leaves')).toBeGreaterThan(minY(d, 'head-metal'));
  });

  it('adds exactly one dark mesh tagged head-recess; the rest of the assembly is unchanged', () => {
    const d = r1013!;
    const on = assembleDesign(d, 'ring');
    const off = assembleDesign(bright(d), 'ring');
    const meshes = (g: THREE.Group) =>
      g.children.filter((o): o is THREE.Mesh => (o as THREE.Mesh).isMesh === true);
    const a = meshes(on.group);
    const b = meshes(off.group);
    expect(a.length).toBe(b.length + 1);
    const tagged = a.filter((m) => m.userData[PART_SLOT] === 'head-recess');
    expect(tagged).toHaveLength(1);
    expect(b.some((m) => m.userData[PART_SLOT] !== undefined)).toBe(false);
    const rest = a.filter((m) => m !== tagged[0]);
    expect(rest.map((m) => Array.from(m.geometry.getAttribute('position').array))).toEqual(
      b.map((m) => Array.from(m.geometry.getAttribute('position').array)),
    );
    // darker than every metal mesh of the same ring
    const metalMeshes = rest.filter((m) => (m.material as THREE.MeshStandardMaterial).metalness >= 0.9);
    expect(metalMeshes.length).toBeGreaterThan(0);
    for (const m of metalMeshes)
      expect(luminance(tagged[0].material as THREE.Material)).toBeLessThan(
        luminance(m.material as THREE.Material) * 0.3,
      );
    disposeGroup(on.group);
    disposeGroup(off.group);
  });

  it('exports as its own metal part (role recess) on the head metal, other parts unchanged', () => {
    const d = r1013!;
    const on = collectParts(d, 'engagement');
    const off = collectParts(bright(d), 'engagement');
    expect(on.length).toBe(off.length + 1);
    const recess = on.filter((p) => p.role === 'recess');
    expect(recess).toHaveLength(1);
    expect(recess[0]).toMatchObject({
      id: 'engagement-recess',
      kind: 'metal',
      materialId: d.engagement.head.metal,
      label: 'Engagement: Oxidised recess',
    });
    expect(triangleCount(recess[0].positions)).toBeGreaterThan(0);
    // the remaining parts classify exactly as without the lining (same ids, roles, metals, geometry)
    const rest = on.filter((p) => p.role !== 'recess');
    expect(rest.map((p) => [p.id, p.role, p.kind, p.materialId])).toEqual(
      off.map((p) => [p.id, p.role, p.kind, p.materialId]),
    );
    expect(rest.map((p) => Array.from(p.positions))).toEqual(off.map((p) => Array.from(p.positions)));
    // slot counts per role
    const count = (ps: typeof on, role: string) => ps.filter((p) => p.role === role).length;
    for (const role of ['shank', 'head', 'center', 'accent']) expect(count(on, role)).toBe(count(off, role));
  });

  it('the spec lists it as an oxidised recess finish on the same metal; totals stay one metal', () => {
    const d = r1013!;
    const on = computeSpec(d, 'engagement');
    const off = computeSpec(bright(d), 'engagement');
    const rec = on.metals.filter((m) => m.role === 'recess');
    expect(rec).toHaveLength(1);
    expect(rec[0].metalId).toBe(d.engagement.head.metal);
    expect(rec[0].finish).toBe(OXIDISED_FINISH);
    expect(rec[0].volumeMm3).toBeGreaterThan(0);
    // a thin skin: a small fraction of the head's metal
    const head = on.metals.find((m) => m.role === 'head')!;
    expect(rec[0].volumeMm3).toBeLessThan(head.volumeMm3 * 0.1);
    for (const m of on.metals.filter((x) => x.role !== 'recess')) expect(m.finish).not.toBe(OXIDISED_FINISH);
    expect(on.mixedMetal).toBe(off.mixedMetal);
    expect(on.metalTotals.map((t) => t.metalId)).toEqual(off.metalTotals.map((t) => t.metalId));
    expect(on.totals.metalGrams).toBeCloseTo(off.totals.metalGrams + rec[0].grams, 9);
    // the piece measurements ignore it (it lies inside the head)
    expect(on.pieces[0].palmWidthMm).toBeCloseTo(off.pieces[0].palmWidthMm, 9);
    expect(on.pieces[0].topWidthMm).toBeCloseTo(off.pieces[0].topWidthMm, 9);
    expect(on.stones).toEqual(off.stones);
    // the BOM has one row per metal part
    const rows = bomRows(on).filter((r) => /oxidised recess/i.test(r.description));
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(computeSpec(d, 'engagement'))).toBe(JSON.stringify(on));
  });

  it('mesh files keep it apart: its own OBJ material, and in the metal STL', () => {
    const d = r1013!;
    const parts = collectParts(d, 'engagement');
    const { obj, mtl } = toObj(parts);
    const metal = d.engagement.head.metal.replace(/[^A-Za-z0-9_-]/g, '_');
    expect(obj).toContain(`usemtl metal_${metal}_oxidised`);
    expect(mtl).toContain(`newmtl metal_${metal}_oxidised`);
    expect(mtl).toContain(`newmtl metal_${metal}\n`);
    const metals = parts.filter((p) => p.kind === 'metal');
    expect(stlTriangleCount(toStl(metals))).toBe(metals.reduce((s, p) => s + triangleCount(p.positions), 0));
  });

  it('designs without it export no recess part', () => {
    for (const d of exampleDesigns.filter((x) => x.id !== 'r1-013').slice(0, 12))
      expect(collectParts(d, 'engagement').some((p) => p.role === 'recess')).toBe(false);
  });
});
