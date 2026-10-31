import { registerStoneBuilder } from '../builders';
import type { BuiltStone, Outline, StoneBuilder } from '../types';
import { FacetMesh, clamp, pNum, pStr, safeDims, type V3 } from './mesh';
import { polygonVertices } from './shapes';

/**
 * Step cuts: concentric rows of facets parallel to the girdle ("hall of mirrors").
 *
 * mode 'octagon' (emerald-cut, asscher, baguette): a rectangle with 45-degree cut corners (chamfer = fraction of width,
 * 0 for a plain rectangle). Rows are inset by an equal distance on every side, so each facet is a planar trapezoid and
 * the pavilion closes on a keel line of length L - W (a point for squares).
 * mode 'polygon' (hexagon, kite, shield...): rows are scaled copies of the polygon about its centroid; pointed culet.
 *
 * Params: mode, shape (polygon mode), chamfer, tablePct, crownPct, girdlePct, crownRows, pavilionRows.
 */
export const buildStep: StoneBuilder = (dims, params, opts): BuiltStone => {
  const { L, W, D } = safeDims(dims);
  const low = opts.detail === 'low';
  const g = clamp(pNum(params, 'girdlePct', 0.02), 0.004, 0.06) * W;
  const crown = clamp(pNum(params, 'crownPct', 0.12) * W, g, D * 0.4);
  const pav = D - crown;
  const tr = clamp(pNum(params, 'tablePct', 0.62), 0.3, 0.85);
  const crownRows = low ? 1 : Math.max(1, Math.round(pNum(params, 'crownRows', 3)));
  const pavRows = low ? 1 : Math.max(1, Math.round(pNum(params, 'pavilionRows', 3)));
  const yT = crown;
  const yGu = g / 2;
  const yGl = -g / 2;
  const yC = -pav;
  // f in 0..1 across the rows; rise / drop grows fastest near the girdle (steeper outer rows)
  const crownRise = (f: number) => 1 - (1 - f) ** 1.6;
  const pavDrop = (f: number) => 1 - (1 - f) ** 1.5;

  const mode = pStr(params, 'mode', 'octagon');
  let ringAt: (f: number, y: number) => V3[]; // f: 0 = girdle, 1 = table (crown) / culet (pavilion); separate below
  let crownRing: (f: number, y: number) => V3[];
  let pavRing: (f: number, y: number) => V3[];
  let center: [number, number];
  let outline: Outline;

  if (mode === 'polygon') {
    const poly = polygonVertices(pStr(params, 'shape', 'hexagon'), params, L / W) ?? polygonVertices('hexagon', params, L / W);
    const verts = (poly ? poly.verts : []).map(([x, z]): [number, number] => [(x * L) / 2, (z * W) / 2]);
    center = polygonCentroid(verts);
    const scaled = (r: number, y: number): V3[] => verts.map(([x, z]): V3 => [center[0] + r * (x - center[0]), y, center[1] + r * (z - center[1])]);
    ringAt = (_f, y) => scaled(1, y);
    crownRing = (f, y) => scaled(1 - f * (1 - tr), y);
    pavRing = (f, y) => scaled(1 - f, y);
    outline = { points: verts.map(([x, z]) => [x, z]), corners: poly ? poly.corners : [] };
  } else {
    const c0 = clamp(pNum(params, 'chamfer', 0.14), 0, 0.45) * W;
    const octa = c0 > 1e-6;
    const ring = (d: number, y: number): V3[] => {
      const hx = Math.max(0, L / 2 - d);
      const hz = Math.max(0, W / 2 - d);
      const ch = Math.min(Math.max(0, c0 - d * (2 - Math.SQRT2)), hx, hz);
      if (!octa)
        return [
          [hx, y, hz],
          [hx, y, -hz],
          [-hx, y, -hz],
          [-hx, y, hz],
        ];
      return [
        [hx, y, hz - ch],
        [hx, y, -(hz - ch)],
        [hx - ch, y, -hz],
        [-(hx - ch), y, -hz],
        [-hx, y, -(hz - ch)],
        [-hx, y, hz - ch],
        [-(hx - ch), y, hz],
        [hx - ch, y, hz],
      ];
    };
    center = [0, 0];
    const dt = (W / 2) * (1 - tr);
    ringAt = (_f, y) => ring(0, y);
    crownRing = (f, y) => ring(f * dt, y);
    pavRing = (f, y) => ring((f * W) / 2, y);
    const G = ring(0, 0).map((p): [number, number] => [p[0], p[2]]);
    if (octa) {
      const pts: [number, number][] = [];
      const corners: number[] = [];
      for (let i = 0; i < 8; i++) {
        pts.push(G[i]);
        if (i % 2 === 1) {
          const n = G[(i + 1) % 8];
          corners.push(pts.length);
          pts.push([(G[i][0] + n[0]) / 2, (G[i][1] + n[1]) / 2]);
        }
      }
      outline = { points: pts, corners };
    } else outline = { points: G, corners: [0, 1, 2, 3] };
  }

  const mesh = new FacetMesh([center[0], (yT + yC) / 2, center[1]], W);
  const Gu = ringAt(0, yGu);
  const Gl = ringAt(0, yGl);
  // crown rows
  let prev = Gu;
  for (let r = 1; r <= crownRows; r++) {
    const f = r / crownRows;
    const next = crownRing(f, yGu + (yT - yGu) * crownRise(f));
    mesh.strip(prev, next);
    prev = next;
  }
  mesh.fan([center[0], yT, center[1]], prev); // table
  mesh.strip(Gu, Gl); // girdle
  prev = Gl;
  for (let r = 1; r <= pavRows; r++) {
    const f = r / pavRows;
    const next = pavRing(f, yGl + (yC - yGl) * pavDrop(f));
    mesh.strip(prev, next);
    prev = next;
  }
  // the last pavilion ring is a keel line or a point; strips into it already close the solid
  return { geometry: mesh.toGeometry(), outline, crownHeight: crown, pavilionDepth: pav, girdleThickness: g };
};

function polygonCentroid(v: [number, number][]): [number, number] {
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < v.length; i++) {
    const p = v[i];
    const q = v[(i + 1) % v.length];
    const cr = p[0] * q[1] - q[0] * p[1];
    a += cr;
    cx += (p[0] + q[0]) * cr;
    cz += (p[1] + q[1]) * cr;
  }
  return Math.abs(a) < 1e-12 ? [0, 0] : [cx / (3 * a), cz / (3 * a)];
}

registerStoneBuilder('step', buildStep);
