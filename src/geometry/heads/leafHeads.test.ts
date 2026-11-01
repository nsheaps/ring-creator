/** Leaf-vine bypass head: sanity, fused to the shank, bypass layout, and every control changes the shape. */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { headBuilders } from '../builders';
import type { Part } from '../types';
import { heads } from '@/models/data/heads';
import type { Params } from '@/models/types';
import './index';
import { ringDrop, signedVolume } from './common';
import { detachedIslands } from '../shanks/connectivity';
import { STUB_CUTS, stubCtx } from './testStub';

const model = heads.find((h) => h.id === 'leaf-vine-bypass');

function build(
  params: Params = {},
  cut = 'oval',
  baseDrop = 3.2,
  bandAxis: [number, number] = [1, 0],
): Part[] {
  if (!model) throw new Error('leaf-vine-bypass model missing');
  const fn = headBuilders.get(model.builder);
  if (!fn) throw new Error(`builder ${model.builder} missing`);
  return fn(stubCtx({ cut, baseDrop, params: { ...model.params, ...params }, bandAxis }));
}

const metalOf = (parts: Part[]) => parts.filter((p) => p.slot === 'head-metal').map((p) => p.geometry);
const stonesOf = (parts: Part[]) => parts.filter((p) => p.slot === 'accent-stone').map((p) => p.geometry);

function verts(geos: THREE.BufferGeometry[]): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const g of geos) {
    const a = g.getAttribute('position');
    for (let i = 0; i < a.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(a, i));
  }
  return out;
}

const tris = (geos: THREE.BufferGeometry[]) =>
  geos.reduce((s, g) => s + g.getAttribute('position').count / 3, 0);

/** Stand-in for the top half of the shank in the stone frame: its top surface is at y = -baseDrop, band along X. */
function shankStandIn(baseDrop: number): THREE.BufferGeometry {
  const Rs = 8.6 + 1.8;
  const tube = 1.1;
  return new THREE.TorusGeometry(Rs - tube, tube, 12, 72, (Math.PI * 2) / 3)
    .rotateZ(Math.PI / 6)
    .translate(0, -baseDrop - Rs, 0);
}

describe('leaf-vine-bypass head', () => {
  const extremes: Params[] = [
    {},
    { leafStyle: 'stone', budStones: 4, leafCount: 4, leafSize: 4.5, branchThickness: 1.8, wrap: 70 },
    { leafCount: 2, leafSize: 1.4, branchThickness: 0.6, budStones: 0, wrap: 0 },
    { leafStyle: 'stone', leafCount: 2, budStones: 0, prongCount: 4, prongStyle: 'round' },
  ];
  for (const cut of STUB_CUTS)
    for (const [i, params] of extremes.entries())
      it(`${cut}, params set ${i}: finite, bounded, within budget, fused to the shank`, () => {
        for (const baseDrop of [1.2, 4.5]) {
          const parts = build(params, cut, baseDrop);
          const metal = metalOf(parts);
          expect(metal.length).toBe(1);
          const all = parts.map((p) => p.geometry);
          // one plain scan per buffer (an expect per float made this file take minutes)
          for (const g of all)
            for (const name of ['position', 'normal']) {
              const arr = g.getAttribute(name).array as ArrayLike<number>;
              let bad = -1;
              for (let k = 0; k < arr.length && bad < 0; k++) if (!Number.isFinite(arr[k])) bad = k;
              expect(bad, `${name}[${bad}] is not finite`).toBe(-1);
            }
          expect(tris(all)).toBeGreaterThan(500);
          expect(tris(all)).toBeLessThan(40000);
          expect(signedVolume(metal[0]), 'winds outward').toBeGreaterThan(0);
          const b = new THREE.Box3();
          for (const g of all) {
            g.computeBoundingBox();
            if (g.boundingBox) b.union(g.boundingBox);
          }
          expect(Math.max(b.max.x, -b.min.x)).toBeLessThan(15);
          expect(Math.max(b.max.z, -b.min.z)).toBeLessThan(12);
          expect(b.max.y).toBeLessThan(4);
          // the branches root in the shoulders up to 2.6 mm below the seat, buried a little into the shank
          expect(b.min.y).toBeGreaterThan(-baseDrop - 4.6);
          // every metal piece is fused to the shank, directly or through other pieces
          if (baseDrop === (i % 2 ? 1.2 : 4.5)) {
            const islands = detachedIslands([shankStandIn(baseDrop), ...metal]);
            expect(islands, JSON.stringify(islands.slice(0, 3))).toEqual([]);
          }
        }
      });

  it('north-south stones on an across-the-finger band axis are fused too', () => {
    const parts = build({ leafStyle: 'stone', budStones: 2 }, 'oval', 3.2, [0, 1]);
    // band along Z: rotate the stand-in shank a quarter turn about Y
    const shank = shankStandIn(3.2).rotateY(Math.PI / 2);
    expect(detachedIslands([shank, ...metalOf(parts)])).toEqual([]);
  });

  it('is deterministic', () => {
    const a = metalOf(build({ leafStyle: 'stone', budStones: 3 }))[0].getAttribute('position').array;
    const b = metalOf(build({ leafStyle: 'stone', budStones: 3 }))[0].getAttribute('position').array;
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('the branches pass opposite sides of the stone like a bypass and leave the top of the stone clear', () => {
    const v = verts(metalOf(build({ budStones: 0 })));
    // the oval is 8.96 x 6.4 mm along X: beside its middle, the branches run on both sides across the finger
    const mid = v.filter((p) => Math.abs(p.x) < 1);
    expect(mid.some((p) => p.z > 3.3)).toBe(true);
    expect(mid.some((p) => p.z < -3.3)).toBe(true);
    // the +X shoulder carries the branch that wraps +Z, the -X shoulder the one that wraps -Z (point symmetric)
    const shoulder = (s: number) => v.filter((p) => s * p.x > 5.5 && p.y < -2);
    expect(shoulder(1).length).toBeGreaterThan(20);
    expect(shoulder(-1).length).toBeGreaterThan(20);
    // nothing but prong tips over the table
    expect(v.some((p) => p.y > 0.4 && Math.hypot(p.x / 4.48, p.z / 3.2) < 0.6)).toBe(false);
  });

  it('the twigs run low along the shoulders before rising to the stone', () => {
    const ctx = stubCtx({ cut: 'oval', baseDrop: 3.2, params: {}, bandAxis: [1, 0] });
    // highest metal over each shoulder strip, above the shank top there; bare twigs only so leaves do not count
    const v = verts(metalOf(build({ budStones: 0, leafCount: 2, leafSize: 1.4 })));
    for (const s of [1, -1]) {
      const strip = v.filter((p) => s * p.x > 5.4 && s * p.x < 6 && Math.abs(p.z) < 1.2);
      expect(strip.length).toBeGreaterThan(10);
      const lift = Math.max(...strip.map((p) => p.y + 3.2 + ringDrop(ctx, p.x)));
      expect(lift).toBeLessThan(1.6);
    }
  });

  it('metal leaves add metal, stone leaves add marquise stones, bud stones add small stones', () => {
    const plain = build({ budStones: 0, leafStyle: 'metal' });
    expect(stonesOf(plain)).toHaveLength(0);
    const metalLeaves = tris(metalOf(plain));
    const stoneLeaves = build({ budStones: 0, leafStyle: 'stone' });
    expect(tris(stonesOf(stoneLeaves))).toBeGreaterThan(0);
    expect(tris(metalOf(stoneLeaves))).not.toBe(metalLeaves);
    const buds = (n: number) => tris(stonesOf(build({ budStones: n })));
    expect(buds(3)).toBeCloseTo(buds(1) * 3, 0);
  });

  it('leaf count and leaf size grow the foliage', () => {
    const area = (params: Params) => {
      const b = new THREE.Box3().setFromPoints(verts(metalOf(build({ budStones: 0, ...params }))));
      return (b.max.x - b.min.x) * (b.max.z - b.min.z);
    };
    expect(tris(metalOf(build({ leafCount: 4 })))).toBeGreaterThan(tris(metalOf(build({ leafCount: 2 }))));
    expect(area({ leafSize: 4.2 })).toBeGreaterThan(area({ leafSize: 1.6 }) * 1.2);
  });

  it('branch thickness thickens the twigs', () => {
    // two twigs of ~12 mm each: going from 0.7 to 1.7 mm across adds well over 20 mm3 of metal
    const vol = (t: number) => signedVolume(metalOf(build({ branchThickness: t, budStones: 0 }))[0]);
    expect(vol(1.7) - vol(0.7)).toBeGreaterThan(20);
  });

  it('wrap carries each branch further round the stone', () => {
    // the +X branch wraps the +Z side; with a big wrap it runs on round the far (-X) end of the 8.96 x 6.4 mm oval
    const farEnd = (w: number) =>
      verts(metalOf(build({ wrap: w, budStones: 0, leafCount: 2, leafSize: 1.4 }))).filter(
        (p) =>
          p.y > -1.5 &&
          Math.hypot(p.x / 4.48, p.z / 3.2) > 1.12 &&
          Math.abs(Math.atan2(p.z, -p.x)) < (12 * Math.PI) / 180,
      ).length;
    expect(farEnd(5)).toBe(0);
    expect(farEnd(60)).toBeGreaterThan(100);
  });

  it('hand mirrors the swirl across the finger', () => {
    // quadrant vertex counts above the shank: a left hand swaps the +Z and -Z sides
    const quads = (hand: string) => {
      const v = verts(metalOf(build({ hand, budStones: 2 }))).filter((p) => p.y > -1.5 && p.x > 0.05);
      return [v.filter((p) => p.z > 0.05).length, v.filter((p) => p.z < -0.05).length];
    };
    const [r1, r4] = quads('right');
    const [l1, l4] = quads('left');
    expect(Math.abs(r1 - l4)).toBeLessThan(r1 * 0.02);
    expect(Math.abs(r4 - l1)).toBeLessThan(r4 * 0.02);
    expect(Math.abs(r1 - r4)).toBeGreaterThan(r1 * 0.04);
  });
});
