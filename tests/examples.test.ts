import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import '@/models/data';
import { assembleDesign } from '@/geometry/assemble';
import { exampleDesigns } from '@/models/data/examples';

describe('every example ring assembles to sane 3D geometry', () => {
  for (const d of exampleDesigns) {
    it(`${d.id} ${d.name}`, () => {
      const view = d.band ? 'set' : 'ring';
      const { group, info } = assembleDesign(d, d.view === 'band' ? 'band' : view);
      const box = new THREE.Box3().setFromObject(group);
      expect(box.isEmpty()).toBe(false);
      const size = box.getSize(new THREE.Vector3());
      for (const v of [size.x, size.y, size.z]) expect(Number.isFinite(v)).toBe(true);
      expect(size.x).toBeGreaterThan(10);
      expect(size.x).toBeLessThan(60);
      expect(info.triangles).toBeGreaterThan(200);
      expect(info.triangles).toBeLessThan(250000);
    });
  }
});
