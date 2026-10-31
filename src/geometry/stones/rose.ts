import { registerStoneBuilder } from '../builders';
import type { BuiltStone, StoneBuilder } from '../types';
import {
  FacetMesh,
  clamp,
  joinRings,
  nearestIndex,
  pNum,
  pStr,
  safeDims,
  uniqueParams,
  type RingPt,
  type V3,
} from './mesh';
import { makeShape, outlineCentroid } from './shapes';

/**
 * Rose cut: a faceted dome of triangles rising to a point, on a flat base (no pavilion).
 * Full: apex, a ring of `segments` star facets, an offset ring of cross facets, then the girdle facets (classic 24-ish facets
 * for segments = 6). Params: shape, segments, girdlePct, domePct (0..1 how rounded the dome is).
 * pavilionDepth = girdle/2 (the flat base), crownHeight = depth - pavilionDepth.
 */
export const buildRose: StoneBuilder = (dims, params, opts): BuiltStone => {
  const { L, W, D } = safeDims(dims);
  const shape = makeShape(pStr(params, 'shape', 'round'), params, L / W);
  const P = (t: number): [number, number] => {
    const [x, z] = shape.at(t);
    return [(x * L) / 2, (z * W) / 2];
  };
  const c = outlineCentroid(P);
  const g = clamp(pNum(params, 'girdlePct', 0.03), 0.005, 0.08) * W;
  const pav = g / 2;
  const crown = Math.max(D - pav, g);
  const s = Math.max(3, Math.round(pNum(params, 'segments', 6)));
  const dome = clamp(pNum(params, 'domePct', 0.8), 0, 1);
  const low = opts.detail === 'low';
  const height = (r: number) => {
    const sph = Math.sqrt(Math.max(0, 1 - r * r));
    const lin = 1 - r;
    return g / 2 + (crown - g / 2) * (dome * sph + (1 - dome) * lin);
  };
  const ring = (ts: number[], r: number, y: number): RingPt[] =>
    ts.map((t) => {
      const [x, z] = P(t);
      return { t, p: [c[0] + r * (x - c[0]), y, c[1] + r * (z - c[1])] as V3 };
    });
  const mesh = new FacetMesh([c[0], (crown - pav) / 2, c[1]], W);
  const apex: RingPt[] = [{ t: 0, p: [c[0], crown, c[1]] }];
  const seg = (n: number, phase: number) => Array.from({ length: n }, (_, i) => (i + phase) / n);
  const gts = uniqueParams([...seg(low ? 2 * s : 4 * s, 0), ...shape.corners]);
  const Gu = ring(gts, 1, g / 2);
  const Gl = ring(gts, 1, -g / 2);
  if (low) {
    const A = ring(seg(s, 0), 0.55, height(0.55));
    joinRings(mesh, apex, A);
    joinRings(mesh, A, Gu);
  } else {
    const A = ring(seg(s, 0), 0.45, height(0.45));
    const B = ring(seg(s, 0.5), 0.8, height(0.8));
    joinRings(mesh, apex, A);
    joinRings(mesh, A, B);
    joinRings(mesh, B, Gu);
  }
  mesh.strip(
    Gu.map((q) => q.p),
    Gl.map((q) => q.p),
  );
  mesh.fan(
    [c[0], -g / 2, c[1]],
    Gl.map((q) => q.p),
  ); // flat base
  return {
    geometry: mesh.toGeometry(),
    outline: {
      points: Gu.map((q) => [q.p[0], q.p[2]]),
      corners: shape.corners.map((t) => nearestIndex(gts, t)),
    },
    crownHeight: crown,
    pavilionDepth: pav,
    girdleThickness: g,
  };
};

registerStoneBuilder('rose', buildRose);
