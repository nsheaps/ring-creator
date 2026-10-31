import { registerStoneBuilder } from '../builders';
import type { BuiltStone, StoneBuilder } from '../types';
import { FacetMesh, clamp, pNum, pStr, nearestIndex, safeDims, uniqueParams, type V3 } from './mesh';
import { makeShape, outlineCentroid } from './shapes';

/**
 * Brilliant faceting on any outline (round, oval, cushion, pear, marquise, heart, princess, trillion, radiant...).
 *
 * Params: shape, mains (k sectors; 8 for a round), tablePct (table width / stone width), crownPct (crown height / width),
 * girdlePct, starPct (star length 0..1 of table-to-girdle), lowerGirdlePct (0..1 of girdle-to-culet), culetPct (0 = pointed),
 * girdleSub (girdle segments per half sector), plus shape params (superP, tipPower, bulge, chamfer...).
 *
 * Crown: table, k star facets, k kite bezels, 2k upper-girdle facets. Pavilion: k mains, 2k lower-girdle facets, culet.
 * Table at y = crownHeight, girdle band y in [-g/2, g/2], culet at y = -pavilionDepth; crownHeight + pavilionDepth = depth.
 */
export const buildBrilliant: StoneBuilder = (dims, params, opts): BuiltStone => {
  const { L, W, D } = safeDims(dims);
  const shape = makeShape(pStr(params, 'shape', 'round'), params, L / W);
  const P = (t: number): [number, number] => {
    const [x, z] = shape.at(t);
    return [(x * L) / 2, (z * W) / 2];
  };
  const c = outlineCentroid(P);
  const g = clamp(pNum(params, 'girdlePct', 0.02), 0.004, 0.06) * W;
  const crown = clamp(pNum(params, 'crownPct', 0.15) * W, g, D * 0.42);
  const pav = D - crown;
  const tr = clamp(pNum(params, 'tablePct', 0.57), 0.25, 0.85);
  const yT = crown;
  const yGu = g / 2;
  const yGl = -g / 2;
  const yC = -pav;
  const at = (t: number, r: number, y: number): V3 => {
    const [x, z] = P(t);
    return [c[0] + r * (x - c[0]), y, c[1] + r * (z - c[1])];
  };
  const mesh = new FacetMesh([c[0], (yT + yC) / 2, c[1]], W);
  const tableCenter: V3 = [c[0], yT, c[1]];
  const culetCenter: V3 = [c[0], yC, c[1]];
  const k = Math.max(3, Math.round(pNum(params, 'mains', 8)));

  if (opts.detail === 'low') {
    const kl = Math.min(k, 8);
    const ts = uniqueParams([...Array.from({ length: kl }, (_, i) => i / kl), ...shape.corners]);
    const Gu = ts.map((t) => at(t, 1, yGu));
    const Gl = ts.map((t) => at(t, 1, yGl));
    const T = ts.map((t) => at(t, tr, yT));
    mesh.fan(tableCenter, T);
    mesh.strip(T, Gu);
    mesh.strip(Gu, Gl);
    mesh.fan(culetCenter, Gl);
    return {
      geometry: mesh.toGeometry(),
      outline: { points: Gu.map((p) => [p[0], p[2]]), corners: shape.corners.map((t) => nearestIndex(ts, t)) },
      crownHeight: crown,
      pavilionDepth: pav,
      girdleThickness: g,
    };
  }

  const m = Math.max(1, Math.round(pNum(params, 'girdleSub', 3)));
  const N = 2 * k * m;
  const tj = (j: number) => j / N;
  const Gu: V3[] = [];
  const Gl: V3[] = [];
  for (let j = 0; j < N; j++) {
    Gu.push(at(tj(j), 1, yGu));
    Gl.push(at(tj(j), 1, yGl));
  }
  const gu = (j: number) => Gu[((j % N) + N) % N];
  const gl = (j: number) => Gl[((j % N) + N) % N];

  // ---- crown
  const cone = (r: number) => yGu + ((yT - yGu) * (1 - r)) / (1 - tr);
  const sr = tr + clamp(pNum(params, 'starPct', 0.5), 0.2, 0.8) * (1 - tr);
  const yS = cone(sr) + 0.12 * (yT - cone(sr)); // stars are flatter than bezels
  const T: V3[] = [];
  const S: V3[] = [];
  for (let i = 0; i < k; i++) {
    T.push(at(i / k, tr, yT));
    S.push(at((i + 0.5) / k, sr, yS));
  }
  const tAt = (i: number) => T[((i % k) + k) % k];
  const sAt = (i: number) => S[((i % k) + k) % k];
  mesh.fan(tableCenter, T); // table
  for (let i = 0; i < k; i++) {
    mesh.tri(tAt(i), tAt(i + 1), sAt(i)); // star facet
    // kite bezel: table corner, star, girdle main point, star (split on the star-star ridge)
    // (reflex kites, e.g. at a heart's cleft, use the table-girdle diagonal instead)
    const a = sAt(i - 1);
    const b = sAt(i);
    const top = tAt(i);
    const bot = gu(2 * i * m);
    if (sideXZ(a, b, top) * sideXZ(a, b, bot) < 0) {
      mesh.tri(a, b, top);
      mesh.tri(a, bot, b);
    } else {
      mesh.tri(top, a, bot);
      mesh.tri(top, bot, b);
    }
    // upper girdle facets (fanned over the girdle segments under this star)
    for (let j = 2 * i * m; j < 2 * (i + 1) * m; j++) mesh.tri(sAt(i), gu(j), gu(j + 1));
  }

  // ---- girdle band
  mesh.strip(Gu, Gl);

  // ---- pavilion
  const cp = clamp(pNum(params, 'culetPct', 0), 0, 0.2);
  const lg = clamp(pNum(params, 'lowerGirdlePct', 0.77), 0.3, 0.9);
  const Lp: V3[] = [];
  for (let i = 0; i < k; i++) {
    const G = gl((2 * i + 1) * m);
    const f = 1 - lg;
    Lp.push([culetCenter[0] + f * (G[0] - culetCenter[0]), culetCenter[1] + f * (G[1] - culetCenter[1]), culetCenter[2] + f * (G[2] - culetCenter[2])]);
  }
  const lAt = (i: number) => Lp[((i % k) + k) % k];
  const Cp: V3[] = cp > 0 ? Array.from({ length: k }, (_, i) => at(i / k, cp, yC)) : [];
  const cAt = (i: number): V3 => (cp > 0 ? Cp[((i % k) + k) % k] : culetCenter);
  for (let i = 0; i < k; i++) {
    const Gm = gl(2 * i * m);
    // pavilion main (kite): culet, lower-girdle point, girdle main point, lower-girdle point
    mesh.tri(cAt(i), lAt(i - 1), Gm);
    mesh.tri(cAt(i), Gm, lAt(i));
    if (cp > 0) mesh.tri(lAt(i), cAt(i), cAt(i + 1));
    // lower girdle facets
    for (let j = 2 * i * m; j < 2 * (i + 1) * m; j++) mesh.tri(lAt(i), gl(j), gl(j + 1));
  }
  if (cp > 0) mesh.fan(culetCenter, Cp); // open culet facet

  const ts = Array.from({ length: N }, (_, j) => tj(j));
  return {
    geometry: mesh.toGeometry(),
    outline: { points: Gu.map((p) => [p[0], p[2]]), corners: shape.corners.map((t) => nearestIndex(ts, t)) },
    crownHeight: crown,
    pavilionDepth: pav,
    girdleThickness: g,
  };
};


/** Which side of the line a->b (projected on XZ) point p lies on. */
function sideXZ(a: V3, b: V3, p: V3): number {
  return (b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0]);
}

registerStoneBuilder('brilliant', buildBrilliant);
