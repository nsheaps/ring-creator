/** Plain metal shanks: one swept band whose section and taper differ per style. */
import type { Params } from '@/models/types';
import { registerShankBuilder } from '../builders';
import type { ShankCtx, ShankResult } from '../types';
import type { ProfilePoint } from '../helpers';
import {
  TAU,
  bandSection,
  clamp,
  metal,
  num,
  outerExpFromRoundness,
  readTaper,
  rng,
  sweep,
  taperedBand,
  thickAt,
  widthAt,
  type Taper,
} from './common';

interface PlainDefaults {
  w: number;
  wTop: number;
  t: number;
  tTop: number;
  taperDeg: number;
  roundness: number;
  innerExp: number;
  split: number;
}

function plain(label: string, d: PlainDefaults, opts: { knife?: boolean; comfort?: boolean } = {}) {
  return (ctx: ShankCtx): ShankResult => {
    const p = ctx.params;
    const R = ctx.innerRadius;
    const tp = readTaper(p, d);
    let outerExp = outerExpFromRoundness(num(p, 'roundness', d.roundness, 0, 1));
    let innerExp = d.innerExp;
    let split = d.split;
    if (opts.knife) {
      // ridge: exponent < 1 gives slightly concave flanks meeting at a sharp crest
      outerExp = 1.25 - num(p, 'ridgeSharpness', 0.5, 0, 1) * 0.5;
      split = 0.68;
    }
    if (opts.comfort) {
      const dome = num(p, 'innerDome', 0.35, 0.1, 0.6);
      innerExp = 2.2;
      split = 1 - dome;
    }
    const g = taperedBand(R, tp, { outerExp, innerExp, split, n: 24, smoothProfile: !opts.knife });
    return { parts: [metal([g], label)], seatY: R + tp.tTop, topWidth: tp.wTop };
  };
}

registerShankBuilder(
  'plain-round',
  plain('plain round shank', {
    w: 2.0,
    wTop: 2.2,
    t: 1.8,
    tTop: 2.0,
    taperDeg: 70,
    roundness: 1,
    innerExp: 3,
    split: 0.62,
  }),
);
registerShankBuilder(
  'plain-flat',
  plain('plain flat shank', {
    w: 2.2,
    wTop: 2.3,
    t: 1.6,
    tTop: 1.8,
    taperDeg: 70,
    roundness: 0.05,
    innerExp: 5,
    split: 0.5,
  }),
);
registerShankBuilder(
  'knife-edge',
  plain(
    'knife-edge shank',
    { w: 2.2, wTop: 2.3, t: 1.9, tTop: 2.1, taperDeg: 70, roundness: 0, innerExp: 4, split: 0.68 },
    { knife: true },
  ),
);
registerShankBuilder(
  'tapered',
  plain('tapered shank', {
    w: 1.8,
    wTop: 3.0,
    t: 1.5,
    tTop: 2.2,
    taperDeg: 110,
    roundness: 0.7,
    innerExp: 3.5,
    split: 0.6,
  }),
);
registerShankBuilder(
  'wide',
  plain('wide shank', {
    w: 4.0,
    wTop: 4.0,
    t: 1.8,
    tTop: 1.9,
    taperDeg: 70,
    roundness: 0.55,
    innerExp: 3,
    split: 0.6,
  }),
);
registerShankBuilder(
  'dainty',
  plain('dainty shank', {
    w: 1.5,
    wTop: 1.7,
    t: 1.3,
    tTop: 1.5,
    taperDeg: 60,
    roundness: 0.9,
    innerExp: 3,
    split: 0.6,
  }),
);
registerShankBuilder(
  'comfort-fit',
  plain(
    'comfort-fit shank',
    { w: 2.2, wTop: 2.3, t: 1.8, tTop: 1.9, taperDeg: 70, roundness: 0.85, innerExp: 2.2, split: 0.65 },
    { comfort: true },
  ),
);

// ---------------------------------------------------------------------------------------------
// Hammered: overlapping spherical dimples (seeded jittered grid) pressed into the outer surface.
// ---------------------------------------------------------------------------------------------

interface Dimple {
  s: number; // arc position (mm) along the outer surface
  u: number; // axial position (mm)
  rad: number;
}

function hammered(ctx: ShankCtx): ShankResult {
  const p: Params = ctx.params;
  const R = ctx.innerRadius;
  const tp: Taper = readTaper(p, { w: 2.4, wTop: 2.5, t: 1.8, tTop: 2.0, taperDeg: 70 });
  const depth = num(p, 'dentDepthMm', 0.12, 0, 0.3);
  const cell = num(p, 'dentSizeMm', 1.1, 0.5, 2.5);
  const seed = Math.round(num(p, 'seed', 7, 1, 9999));
  const rand = rng(seed);
  const Rout = R + tp.tBottom;
  const circ = TAU * Rout;
  const cols = Math.max(8, Math.round(circ / cell));
  const colW = circ / cols;
  const maxW = Math.max(tp.wBottom, tp.wTop);
  const rows = Math.max(2, Math.ceil(maxW / cell) + 1);
  const rowH = (maxW + cell) / rows;
  const dimples: Dimple[] = [];
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++)
      dimples.push({
        s: (i + 0.15 + rand() * 0.7) * colW,
        u: -maxW / 2 - cell / 2 + (j + 0.15 + rand() * 0.7) * rowH,
        rad: cell * (0.55 + rand() * 0.3),
      });
  const disp = (theta: number, u: number): number => {
    let s = ((theta % TAU) + TAU) % TAU;
    s *= Rout;
    let best = Infinity;
    for (const d of dimples) {
      let ds = Math.abs(d.s - s);
      if (ds > circ / 2) ds = circ - ds;
      if (ds > cell * 2) continue;
      const dd = Math.hypot(ds, d.u - u) / d.rad;
      if (dd < best) best = dd;
    }
    return -depth * Math.max(0, 1 - best * best);
  };
  const outerExp = outerExpFromRoundness(num(p, 'roundness', 0.5, 0, 1));
  const n = 32;
  const g = sweep({
    segments: 240,
    profile: (th) => {
      const w = widthAt(tp, th);
      const t = thickAt(tp, th);
      const sec = bandSection({ w, t, R, outerExp, innerExp: 3, split: 0.6, n });
      const rMid = R + t * 0.4;
      return sec.map(([u, r], k): ProfilePoint => {
        // only the outer half is dented, fading to zero at the side midline so the finger hole stays exact
        const a = (k / n) * TAU;
        const sn = Math.sin(a);
        if (sn <= 0) return [u, r];
        const f = clamp(sn * 1.5, 0, 1);
        const dz = disp(th, u) * f;
        const dr = r - rMid;
        return [u * (1 + (dz * 0.2) / Math.max(0.5, w)), rMid + Math.max(0.05, dr + dz)];
      });
    },
  });
  return {
    parts: [metal([g], 'hammered shank')],
    seatY: R + tp.tTop + Math.min(0, disp(Math.PI / 2, 0)),
    topWidth: tp.wTop,
  };
}
registerShankBuilder('hammered', hammered);
