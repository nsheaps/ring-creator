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

/** Split a merged stone buffer into its stones (closed meshes sharing vertex positions). */
function splitStones(geos: THREE.BufferGeometry[]): THREE.Vector3[][] {
  const pts = verts(geos);
  const parent = pts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const key = new Map<string, number>();
  pts.forEach((p, i) => {
    const k = `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`;
    const j = key.get(k);
    if (j === undefined) key.set(k, i);
    else parent[find(i)] = find(j);
    // the three corners of a triangle belong together
    if (i % 3) parent[find(i)] = find(i - 1);
  });
  const groups = new Map<number, THREE.Vector3[]>();
  pts.forEach((p, i) => {
    const r = find(i);
    const g = groups.get(r) ?? [];
    g.push(p);
    groups.set(r, g);
  });
  return [...groups.values()];
}

/**
 * Seen from above, how many pairs of stones overlap: a stone's plan is the ellipse on its principal axes (half its
 * length and width), shrunk to 85 %; two overlap when a vertex of one falls inside the other's ellipse.
 */
function overlappingStones(stones: THREE.Vector3[][]): number {
  const plans = stones.map((ps) => {
    const c = ps.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(ps.length);
    let sxx = 0;
    let sxz = 0;
    let szz = 0;
    for (const p of ps) {
      sxx += (p.x - c.x) ** 2;
      sxz += (p.x - c.x) * (p.z - c.z);
      szz += (p.z - c.z) ** 2;
    }
    const th = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    const d = [Math.cos(th), Math.sin(th)];
    const along = (p: THREE.Vector3) => (p.x - c.x) * d[0] + (p.z - c.z) * d[1];
    const across = (p: THREE.Vector3) => -(p.x - c.x) * d[1] + (p.z - c.z) * d[0];
    const L = Math.max(...ps.map((p) => Math.abs(along(p)))) * 0.85;
    const W = Math.max(...ps.map((p) => Math.abs(across(p)))) * 0.85;
    return { ps, inside: (p: THREE.Vector3) => (along(p) / L) ** 2 + (across(p) / W) ** 2 < 1 };
  });
  let n = 0;
  for (let i = 0; i < plans.length; i++)
    for (let j = i + 1; j < plans.length; j++)
      if (plans[i].ps.some(plans[j].inside) || plans[j].ps.some(plans[i].inside)) n++;
  return n;
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
    {
      leafStyle: 'stone',
      leafPairs: true,
      leafCount: 6,
      leafSize: 4.5,
      budStones: 4,
      branchThickness: 1.8,
      wrap: 70,
    },
    { leafPairs: true, leafCount: 6, leafSize: 1.4, budStones: 1, branchThickness: 0.6, wrap: 0 },
    {
      leafStyle: 'stone',
      leafSeat: 'box',
      twigProfile: 'flat',
      twigRatio: 4,
      leafPairs: true,
      leafCount: 6,
      leafSize: 4.5,
      budStones: 4,
      branchThickness: 1.8,
      wrap: 70,
    },
    {
      leafStyle: 'stone',
      leafSeat: 'box',
      twigProfile: 'flat',
      twigRatio: 1.5,
      branchThickness: 0.6,
      wrap: 0,
    },
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

  it('sprigs carry leaves out along both shoulders, and a bud moves onto the root sprig', () => {
    // stone leaves sit on both sprigs too, so the foliage spreads past the branch roots towards the band ends
    const stones = verts(stonesOf(build({ leafStyle: 'stone', leafCount: 2, budStones: 0 })));
    expect(stones.some((p) => p.x > 7)).toBe(true);
    expect(stones.some((p) => p.x < -7)).toBe(true);
    // budStones stays the total per branch: with 2 or more, one sits on the root sprig instead of the main twig
    const budTris = (n: number) =>
      tris(stonesOf(build({ budStones: n }))) - tris(stonesOf(build({ budStones: 0 })));
    expect(budTris(2)).toBeCloseTo(budTris(1) * 2, 0);
    expect(budTris(4)).toBeCloseTo(budTris(1) * 4, 0);
  });

  it('the twigs root near the band ends, and the two branches are not exact point-symmetric copies', () => {
    for (const bandAxis of [
      [1, 0],
      [0, 1],
    ] as [number, number][]) {
      const parts = build({ leafStyle: 'stone', leafCount: 3, budStones: 0 }, 'oval', 3.2, bandAxis);
      // positions in band coordinates: a along the band, c across it
      const band = (geos: THREE.BufferGeometry[]) =>
        verts(geos).map((p) => ({
          a: p.x * bandAxis[0] + p.z * bandAxis[1],
          c: p.z * bandAxis[0] - p.x * bandAxis[1],
          y: p.y,
        }));
      const v = band(metalOf(parts));
      // the lowest metal over each shoulder is the twig's root, emerging from the shank well out along the band
      for (const s of [1, -1]) {
        const low = v
          .filter((p) => s * p.a > 0 && Math.abs(p.c) < 1.5)
          .sort((p, q) => p.y - q.y)
          .slice(0, 40);
        expect(low.reduce((t, p) => t + s * p.a, 0) / low.length).toBeGreaterThan(7.4);
      }
      // the second branch roots nearer the stone and takes its leaves in another order, so a half turn does not map
      // the foliage onto itself
      const st = band(stonesOf(parts));
      const ext = (f: (p: { a: number; c: number }) => number) => Math.max(...st.map(f));
      expect(
        Math.abs(ext((p) => p.a) - ext((p) => -p.a)) + Math.abs(ext((p) => p.c) - ext((p) => -p.c)),
      ).toBeGreaterThan(0.3);
    }
  });

  it('leaf pairs add inner partner leaves and tiny buds without piling stones on stones', () => {
    for (const bandAxis of [
      [1, 0],
      [0, 1],
    ] as [number, number][]) {
      const stones = (params: Params) =>
        splitStones(
          stonesOf(
            build({ leafStyle: 'stone', leafCount: 6, budStones: 3, ...params }, 'oval', 3.2, bandAxis),
          ),
        );
      const single = stones({});
      const paired = stones({ leafPairs: true });
      // north-south the twigs climb clear of the stone, so the inner partners fit; east-west the long stone fills the
      // inside of the climb and they give way to tiny buds
      expect(paired.length).toBeGreaterThan(single.length + (bandAxis[1] ? 3 : -1));
      // every stone keeps its own spot, paired or with more than four leaves a branch
      expect(overlappingStones(paired)).toBe(0);
      expect(overlappingStones(single)).toBe(0);
    }
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

  it('round twigs and wire seats are the defaults: naming them changes nothing', () => {
    const base = { leafStyle: 'stone', leafPairs: true, leafCount: 6, budStones: 4 };
    const key = (parts: Part[]) => parts.map((p) => Array.from(p.geometry.getAttribute('position').array));
    expect(key(build({ ...base, twigProfile: 'round', twigRatio: 3.5, leafSeat: 'wire' }))).toEqual(
      key(build(base)),
    );
    // a box seat only applies to stone leaves
    expect(key(build({ leafStyle: 'metal', leafSeat: 'box' }))).toEqual(key(build({ leafStyle: 'metal' })));
  });

  it('flat twigs are ribbons: wider than thick with a flat top, wider with a bigger ratio', () => {
    const bare = (params: Params) =>
      metalOf(build({ budStones: 0, leafCount: 2, leafSize: 1.4, branchThickness: 1.2, ...params }))[0];
    // area of metal facing straight up (the ribbon's flat top) and the metal's plan area seen from above
    const faces = (g: THREE.BufferGeometry) => {
      const pos = g.getAttribute('position');
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c = new THREE.Vector3();
      let flatTop = 0;
      let plan = 0;
      for (let i = 0; i < pos.count; i += 3) {
        a.fromBufferAttribute(pos, i);
        b.fromBufferAttribute(pos, i + 1);
        c.fromBufferAttribute(pos, i + 2);
        const n = b.clone().sub(a).cross(c.clone().sub(a));
        const area = n.length() / 2;
        if (area < 1e-12) continue;
        if (n.y / (2 * area) > 0.97) flatTop += area;
        if (n.y > 0) plan += n.y / 2;
      }
      return { flatTop, plan };
    };
    const round = faces(bare({}));
    const flat = faces(bare({ twigProfile: 'flat', twigRatio: 2.5 }));
    const wide = faces(bare({ twigProfile: 'flat', twigRatio: 4 }));
    expect(flat.flatTop).toBeGreaterThan(round.flatTop + 5);
    expect(flat.plan).toBeGreaterThan(round.plan + 5);
    expect(wide.plan).toBeGreaterThan(flat.plan + 3);
    // the same metal spread wider (the same cross-section area as the round twig), so the ribbon is thinner
    const ratio = signedVolume(bare({ twigProfile: 'flat' })) / signedVolume(bare({}));
    expect(ratio).toBeGreaterThan(0.85);
    expect(ratio).toBeLessThan(1.15);
  });

  it('box seats hold each marquise leaf in a raised box wider than the stone', () => {
    for (const bandAxis of [
      [1, 0],
      [0, 1],
    ] as [number, number][]) {
      const params = { leafStyle: 'stone', leafCount: 6, leafPairs: true, budStones: 3 };
      const wire = build(params, 'oval', 3.2, bandAxis);
      const box = build({ ...params, leafSeat: 'box' }, 'oval', 3.2, bandAxis);
      // the same stones in the same places
      expect(stonesOf(box).map((g) => Array.from(g.getAttribute('position').array))).toEqual(
        stonesOf(wire).map((g) => Array.from(g.getAttribute('position').array)),
      );
      expect(overlappingStones(splitStones(stonesOf(box)))).toBe(0);
      // a box adds metal under each leaf: well over a few mm3 across ~20 leaves
      expect(signedVolume(metalOf(box)[0]) - signedVolume(metalOf(wire)[0])).toBeGreaterThan(3);
      // seen from above the boxes show beside each leaf: the metal's plan area grows by well over 0.5 mm2 a leaf
      const plan = (parts: Part[]) => {
        const pos = metalOf(parts)[0].getAttribute('position');
        const p = [0, 1, 2].map(() => new THREE.Vector3());
        let t = 0;
        for (let i = 0; i < pos.count; i += 3) {
          p.forEach((q, k) => q.fromBufferAttribute(pos, i + k));
          const ny = (p[1].z - p[0].z) * (p[2].x - p[0].x) - (p[1].x - p[0].x) * (p[2].z - p[0].z);
          if (ny > 0) t += ny / 2;
        }
        return t;
      };
      expect(plan(box) - plan(wire)).toBeGreaterThan(8);
    }
  });
});
