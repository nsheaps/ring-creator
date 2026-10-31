/**
 * Test-only stand-in for the stone builders: simple faceted stones with realistic outlines, so head
 * tests do not depend on src/geometry/stones. Not imported by the app.
 */
import * as THREE from 'three';
import type { StoneDims } from '@/models/stoneMath';
import type { CutModel, GemModel } from '@/models/types';
import type { BuiltStone, HeadCtx, Outline } from '../types';

export const STUB_CUTS = [
  'round-brilliant',
  'oval',
  'princess',
  'pear',
  'marquise',
  'heart',
  'emerald-cut',
] as const;
export type StubCut = (typeof STUB_CUTS)[number];

const ASPECT: Record<string, number> = {
  'round-brilliant': 1,
  oval: 1.4,
  princess: 1,
  pear: 1.55,
  marquise: 2,
  heart: 1,
  'emerald-cut': 1.45,
};

export function stubCut(id: string): CutModel {
  return {
    kind: 'cut',
    id,
    name: id,
    summary: '',
    description: '',
    tags: [],
    builder: id,
    params: {},
    volumeFactor: 0.0061,
    defaultAspect: ASPECT[id] ?? 1,
    aspectRange: [1, 2],
    defaultDepthPct: 0.61,
    facetStyle: 'brilliant',
    facetCount: 57,
    vulnerableCorners: 0,
  };
}

export const stubGem: GemModel = {
  kind: 'gem',
  id: 'diamond',
  name: 'Diamond',
  summary: '',
  description: '',
  tags: [],
  lab: false,
  ior: 2.42,
  mohs: 10,
  density: 3.52,
  dispersion: 0.044,
  colors: [{ id: 'white', name: 'White', hex: '#ffffff' }],
  defaultColor: 'white',
  transparency: 'transparent',
  durability: 5,
  priceHintPerCaratUsd: [1000, 10000],
};

function outlineFor(cut: string, L: number, W: number, n = 48): Outline {
  const a = L / 2;
  const b = W / 2;
  const pts: [number, number][] = [];
  const corners: number[] = [];
  const ellipse = (k: number) => {
    for (let i = 0; i < k; i++) {
      const t = (i / k) * Math.PI * 2;
      pts.push([a * Math.cos(t), b * Math.sin(t)]);
    }
  };
  switch (cut) {
    case 'princess':
    case 'emerald-cut': {
      const c = cut === 'emerald-cut' ? Math.min(a, b) * 0.3 : 0;
      const verts: [number, number][] =
        c > 0
          ? [
              [a, -b + c],
              [a, b - c],
              [a - c, b],
              [-a + c, b],
              [-a, b - c],
              [-a, -b + c],
              [-a + c, -b],
              [a - c, -b],
            ]
          : [
              [a, -b],
              [a, b],
              [-a, b],
              [-a, -b],
            ];
      verts.forEach((v, i) => {
        const w = verts[(i + 1) % verts.length];
        corners.push(pts.length);
        for (let k = 0; k < 6; k++)
          pts.push([v[0] + ((w[0] - v[0]) * k) / 6, v[1] + ((w[1] - v[1]) * k) / 6]);
      });
      if (c > 0) corners.splice(0, corners.length, ...corners.filter((_, i) => i % 2 === 0));
      break;
    }
    case 'pear': {
      // rounded end at -X, point at +X
      corners.push(0);
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        pts.push([a * Math.cos(t), b * 1.15 * Math.sin(t) * ((1 - Math.cos(t)) / 2) ** 0.6]);
      }
      break;
    }
    case 'marquise': {
      const rho = (a * a + b * b) / (2 * b);
      const c = rho - b;
      const half = n / 2;
      corners.push(0, half);
      for (let i = 0; i < half; i++) {
        const x = a * Math.cos((Math.PI * i) / half);
        pts.push([x, Math.sqrt(Math.max(0, rho * rho - x * x)) - c]);
      }
      for (let i = 0; i < half; i++) {
        const x = -a * Math.cos((Math.PI * i) / half);
        pts.push([x, -(Math.sqrt(Math.max(0, rho * rho - x * x)) - c)]);
      }
      break;
    }
    case 'heart': {
      // tip at +X, cleft at -X
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        const x = 16 * Math.sin(t) ** 3;
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        pts.push([(-y / 17) * a * 1.0 - a * 0.15, (x / 16) * b]);
      }
      corners.push(n / 2); // the tip (t = PI)
      break;
    }
    default:
      ellipse(n);
  }
  return { points: pts, corners };
}

function stubGeometry(o: Outline, ch: number, pd: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const n = o.points.length;
  const cx = o.points.reduce((s, p) => s + p[0], 0) / n;
  const cz = o.points.reduce((s, p) => s + p[1], 0) / n;
  for (let i = 0; i < n; i++) {
    const a = o.points[i];
    const b = o.points[(i + 1) % n];
    const ta: [number, number] = [cx + (a[0] - cx) * 0.55, cz + (a[1] - cz) * 0.55];
    const tb: [number, number] = [cx + (b[0] - cx) * 0.55, cz + (b[1] - cz) * 0.55];
    pos.push(a[0], 0, a[1], ta[0], ch, ta[1], b[0], 0, b[1]);
    pos.push(b[0], 0, b[1], ta[0], ch, ta[1], tb[0], ch, tb[1]);
    pos.push(cx, ch, cz, tb[0], ch, tb[1], ta[0], ch, ta[1]);
    pos.push(a[0], 0, a[1], b[0], 0, b[1], cx, -pd, cz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function stubStone(cut: string, dims: StoneDims): BuiltStone {
  const o = outlineFor(cut, dims.length, dims.width);
  const ch = dims.width * 0.15;
  const pd = Math.max(0.1, dims.depth - ch - dims.width * 0.02);
  return {
    geometry: stubGeometry(o, ch, pd),
    outline: o,
    crownHeight: ch,
    pavilionDepth: pd,
    girdleThickness: dims.width * 0.02,
  };
}

export interface StubCtxOpts {
  cut?: string;
  width?: number;
  baseDrop?: number;
  bandAxis?: [number, number];
  params?: HeadCtx['params'];
  accentCut?: string;
  accentSize?: number;
}

export function stubCtx(o: StubCtxOpts = {}): HeadCtx {
  const cutId = o.cut ?? 'round-brilliant';
  const cut = stubCut(cutId);
  const W = o.width ?? 6.4;
  const dims: StoneDims = { length: W * cut.defaultAspect, width: W, depth: W * 0.61 };
  const accentCut = stubCut(o.accentCut ?? 'round-brilliant');
  const cache = new Map<string, BuiltStone>();
  return {
    center: { gem: stubGem, colorHex: '#ffffff', cut, dims, carat: 1, built: stubStone(cutId, dims) },
    accent: { gem: stubGem, colorHex: '#ffffff', cut: accentCut, sizeMm: o.accentSize ?? 1.2 },
    params: o.params ?? {},
    baseDrop: o.baseDrop ?? 4.2,
    shankWidth: 2.2,
    bandAxis: o.bandAxis ?? [1, 0],
    innerRadius: 8.6,
    stone(id, d) {
      const key = `${id}:${d.length.toFixed(3)}:${d.width.toFixed(3)}:${d.depth.toFixed(3)}`;
      let s = cache.get(key);
      if (!s) {
        s = stubStone(id, d);
        cache.set(key, s);
      }
      return s;
    },
  };
}
