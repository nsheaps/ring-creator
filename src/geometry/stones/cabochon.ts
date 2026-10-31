import { registerStoneBuilder } from '../builders';
import type { BuiltStone, StoneBuilder } from '../types';
import { FacetMesh, clamp, pNum, safeDims, type V3 } from './mesh';

/**
 * Cabochon: a smooth elliptical dome (half-ellipsoid) on a short vertical girdle and a flat base.
 * The dome carries smooth analytic normals; the girdle and base are flat-shaded so the edge stays crisp.
 * Params: girdlePct, segments (around), rows (up the dome). pavilionDepth = girdle/2, crownHeight = depth - pavilionDepth.
 */
export const buildCabochon: StoneBuilder = (dims, params, opts): BuiltStone => {
  const { L, W, D } = safeDims(dims);
  const low = opts.detail === 'low';
  const g = clamp(pNum(params, 'girdlePct', 0.04), 0.005, 0.1) * W;
  const pav = g / 2;
  const crown = Math.max(D - pav, g);
  const S = low ? 12 : Math.max(8, Math.round(pNum(params, 'segments', 48)));
  const R = low ? 3 : Math.max(3, Math.round(pNum(params, 'rows', 10)));
  const a = L / 2;
  const b = W / 2;
  const h = crown - g / 2;
  const mesh = new FacetMesh([0, (crown - pav) / 2, 0], W);
  const pt = (t: number, phi: number): V3 => {
    const r = Math.cos(phi);
    return [a * r * Math.cos(Math.PI * 2 * t), g / 2 + h * Math.sin(phi), -b * r * Math.sin(Math.PI * 2 * t)];
  };
  const nrm = (p: V3): V3 => {
    const nx = p[0] / (a * a);
    const ny = (p[1] - g / 2) / (h * h);
    const nz = p[2] / (b * b);
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  };
  const rows: V3[][] = [];
  for (let k = 0; k <= R; k++) {
    const phi = (k / R) * (Math.PI / 2);
    rows.push(k === R ? [[0, g / 2 + h, 0]] : Array.from({ length: S }, (_, i) => pt(i / S, phi)));
  }
  for (let k = 0; k < R; k++) {
    const A = rows[k];
    const B = rows[k + 1];
    for (let i = 0; i < S; i++) {
      const i1 = (i + 1) % S;
      if (B.length === 1) {
        mesh.triSmooth(A[i], A[i1], B[0], nrm(A[i]), nrm(A[i1]), [0, 1, 0]);
      } else {
        mesh.triSmooth(A[i], A[i1], B[i1], nrm(A[i]), nrm(A[i1]), nrm(B[i1]));
        mesh.triSmooth(A[i], B[i1], B[i], nrm(A[i]), nrm(B[i1]), nrm(B[i]));
      }
    }
  }
  const Gu = rows[0];
  const Gl = Gu.map((p): V3 => [p[0], -g / 2, p[2]]);
  mesh.strip(Gu, Gl);
  mesh.fan([0, -g / 2, 0], Gl);
  return {
    geometry: mesh.toGeometry(),
    outline: { points: Gu.map((p) => [p[0], p[2]]), corners: [] },
    crownHeight: crown,
    pavilionDepth: pav,
    girdleThickness: g,
  };
};

registerStoneBuilder('cabochon', buildCabochon);
