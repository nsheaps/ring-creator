import { registerStoneBuilder } from '../builders';
import type { BuiltStone, StoneBuilder } from '../types';
import {
  FacetMesh,
  clamp,
  joinRings,
  pNum,
  pStr,
  nearestIndex,
  safeDims,
  uniqueParams,
  type RingPt,
  type V3,
} from './mesh';
import { makeShape, outlineCentroid } from './shapes';

/**
 * Brilliant faceting on any outline (round, oval, cushion, pear, marquise, heart, princess, trillion, radiant...).
 *
 * Params: shape, mains (k sectors; 8 for a round), tablePct (table width / stone width), crownPct (crown height / width),
 * girdlePct, starPct (star length 0..1 of table-to-girdle), lowerGirdlePct (0..1 of girdle-to-culet), culetPct (0 = pointed),
 * girdleSub (girdle segments per half sector), pavilionTiers (>= 2: chevron pavilion rows instead of long mains), plus shape params (superP, tipPower, bulge, chamfer...).
 *
 * Crown: table, k star facets, k kite bezels, 2k upper-girdle facets. Pavilion: k mains, 2k lower-girdle facets, culet.
 * Table at y = crownHeight, girdle band y in [-g/2, g/2], culet at y = -pavilionDepth; crownHeight + pavilionDepth = depth.
 */
export const buildBrilliant: StoneBuilder = (dims, params, opts): BuiltStone => {
  const { L, W, D } = safeDims(dims);
  const shapeName = pStr(params, 'shape', 'round');
  const shape = makeShape(shapeName, params, L / W);
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
    // Melee / pave: no girdle band (invisible at this size), which buys a two-points-per-sector girdle so the crown
    // gets star and bezel facets and the pavilion twice as many mains: small stones still sparkle as cut stones.
    const kl = Math.min(k, 8);
    const tsT = Array.from({ length: kl }, (_, i) => i / kl);
    const ts = uniqueParams([...Array.from({ length: 2 * kl }, (_, i) => i / (2 * kl)), ...shape.corners]);
    const G: RingPt[] = ts.map((t) => ({ t, p: at(t, 1, 0) }));
    const T: RingPt[] = tsT.map((t) => ({ t, p: at(t, tr, yT) }));
    mesh.fan(
      tableCenter,
      T.map((q) => q.p),
    );
    // Rounds keep the cheapest crown (pave uses hundreds of them). Fancy shapes (marquise, pear, oval, heart ...) get
    // real star and kite-bezel facets, so a small side stone still reads as a domed brilliant, not a flat plate.
    if (shapeName === 'round') joinRings(mesh, T, G);
    else lowStarCrown(mesh, T, G, kl, tr, yT, at);
    mesh.fan(
      culetCenter,
      G.map((q) => q.p),
    );
    return {
      geometry: mesh.toGeometry(),
      outline: {
        points: G.map((q) => [q.p[0], q.p[2]]),
        corners: shape.corners.map((t) => nearestIndex(ts, t)),
      },
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
  const tiers = Math.max(1, Math.min(4, Math.round(pNum(params, 'pavilionTiers', 1))));
  if (tiers >= 2) buildChevronPavilion(mesh, tiers, k, at, yGl, yC, Gl, tj);
  else {
    const cp = clamp(pNum(params, 'culetPct', 0), 0, 0.2);
    const lg = clamp(pNum(params, 'lowerGirdlePct', 0.77), 0.3, 0.9);
    const Lp: V3[] = [];
    for (let i = 0; i < k; i++) {
      const G = gl((2 * i + 1) * m);
      const f = 1 - lg;
      Lp.push([
        culetCenter[0] + f * (G[0] - culetCenter[0]),
        culetCenter[1] + f * (G[1] - culetCenter[1]),
        culetCenter[2] + f * (G[2] - culetCenter[2]),
      ]);
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
  }

  const ts = Array.from({ length: N }, (_, j) => tj(j));
  return {
    geometry: mesh.toGeometry(),
    outline: { points: Gu.map((p) => [p[0], p[2]]), corners: shape.corners.map((t) => nearestIndex(ts, t)) },
    crownHeight: crown,
    pavilionDepth: pav,
    girdleThickness: g,
  };
};

/**
 * Chevron pavilion (princess, radiant, cushion): instead of k long mains meeting at the culet, the pavilion is cut in
 * `tiers` rows. Each row is a ring of 2k points (sector mains + mid-sector points) and the mid points sit half a row
 * lower than the mains, so neighbouring rows interlock as V-shaped chevrons. Rows follow a slightly convex profile
 * (each row a little steeper than the one below), so straight-sided outlines do not collapse into one flat face.
 */
function buildChevronPavilion(
  mesh: FacetMesh,
  tiers: number,
  k: number,
  at: (t: number, r: number, y: number) => V3,
  yGl: number,
  yC: number,
  Gl: V3[],
  tj: (j: number) => number,
): void {
  const culet: V3 = at(0, 0, yC);
  const n = 2 * k;
  // radius fraction f (0 culet .. 1 girdle) -> height; the 1.2 power bows the profile outwards (steeper rows near the girdle)
  const yAt = (f: number) => yC + (yGl - yC) * Math.pow(f, 1.2);
  const rows: RingPt[][] = [];
  for (let r = 1; r <= tiers; r++) {
    const row: RingPt[] = [];
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const f = (i % 2 === 0 ? r : r - 0.5) / (tiers + 0.35);
      row.push({ t, p: at(t, f, yAt(f)) });
    }
    rows.push(row);
  }
  mesh.fan(
    culet,
    rows[0].map((q) => q.p),
  );
  for (let r = 0; r + 1 < rows.length; r++) {
    const a = rows[r];
    const b = rows[r + 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      mesh.quad(a[i].p, a[j].p, b[j].p, b[i].p);
    }
  }
  joinRings(
    mesh,
    rows[rows.length - 1],
    Gl.map((p, j) => ({ t: tj(j), p })),
  );
}

/**
 * Low-detail crown with stars: table ring T (kl points at i/kl), star points between them half way to the girdle,
 * kite bezels down to the girdle main points (t = i/kl, always present in G) and upper-girdle fans over the girdle
 * points of each sector. Watertight against the table fan and the girdle ring G.
 */
function lowStarCrown(
  mesh: FacetMesh,
  T: RingPt[],
  G: RingPt[],
  kl: number,
  tr: number,
  yT: number,
  at: (t: number, r: number, y: number) => V3,
): void {
  const sr = tr + 0.5 * (1 - tr);
  const yCone = (yT * (1 - sr)) / (1 - tr);
  const yS = yCone + 0.12 * (yT - yCone);
  const S: V3[] = Array.from({ length: kl }, (_, i) => at((i + 0.5) / kl, sr, yS));
  const gts = G.map((q) => q.t);
  const gIdx = Array.from({ length: kl }, (_, i) => nearestIndex(gts, i / kl));
  const n = G.length;
  for (let i = 0; i < kl; i++) {
    const t0 = T[i].p;
    const t1 = T[(i + 1) % kl].p;
    const s = S[i];
    const sPrev = S[(i - 1 + kl) % kl];
    mesh.tri(t0, t1, s); // star
    const bot = G[gIdx[i]].p;
    if (sideXZ(sPrev, s, t0) * sideXZ(sPrev, s, bot) < 0) {
      mesh.tri(sPrev, s, t0);
      mesh.tri(sPrev, bot, s);
    } else {
      mesh.tri(t0, sPrev, bot);
      mesh.tri(t0, bot, s);
    }
    // upper girdle: star i over the girdle points from main i to main i+1
    const a = gIdx[i];
    const b = gIdx[(i + 1) % kl];
    const steps = (b - a + n) % n || n;
    for (let j = 0; j < steps; j++) mesh.tri(s, G[(a + j) % n].p, G[(a + j + 1) % n].p);
  }
}

/** Which side of the line a->b (projected on XZ) point p lies on. */
function sideXZ(a: V3, b: V3, p: V3): number {
  return (b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0]);
}

registerStoneBuilder('brilliant', buildBrilliant);
