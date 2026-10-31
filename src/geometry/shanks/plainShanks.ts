import type * as THREE from 'three';
/** Plain metal shanks: one swept band whose section and taper differ per style. */
import type { Params } from '@/models/types';
import { registerShankBuilder } from '../builders';
import type { ShankCtx, ShankResult } from '../types';
import {
  BRUSH_PITCH,
  ENGRAVE_STEP,
  SURFACE_TEXTURES,
  brushedDepth,
  engravedDepth,
  onCurve,
  type ProfilePoint,
  type SurfaceTexture,
} from '../helpers';
import {
  TAU,
  TOP,
  bandSection,
  clamp,
  fromTop,
  headHalfAngle,
  metal,
  num,
  outerCurve,
  outerExpFromRoundness,
  readTaper,
  rng,
  signedFromTop,
  smooth,
  str,
  sweep,
  thickAt,
  widthAt,
  type SectionSpec,
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

/**
 * Flat-topped section with small 45 degree chamfers on the top edges (the bright edge lines of a flat band) and a
 * softly rounded inside. Crease points are doubled so the flats and chamfers stay crisp under smooth shading.
 * The flat is sampled at nTop + 1 points and cut by `cut(u)` (brushed grain, engraving).
 */
function flatSection(
  R: number,
  w: number,
  t: number,
  chamfer: number,
  innerExp: number,
  nTop = 1,
  cut: (u: number) => number = () => 0,
): ProfilePoint[] {
  const hw = w / 2;
  const hBot = t * 0.35;
  const rMid = R + hBot;
  const c = Math.min(chamfer, hw * 0.3, t * 0.25);
  const out: ProfilePoint[] = [];
  const nIn = 12;
  for (let i = 0; i <= nIn; i++) {
    const a = Math.PI + (i / nIn) * Math.PI;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    out.push([
      hw * Math.sign(ca) * Math.abs(ca) ** (2 / innerExp),
      rMid + hBot * Math.sign(sa) * Math.abs(sa) ** (2 / innerExp),
    ]);
  }
  const top = R + t;
  const flat: ProfilePoint[] = [];
  for (let i = 0; i <= nTop; i++) {
    const u = hw - c - (2 * (hw - c) * i) / nTop;
    flat.push([u, top - (i === 0 || i === nTop ? 0 : cut(u))]);
  }
  const crisp: ProfilePoint[] = [
    [hw, rMid],
    [hw, top - c],
    [hw, top - c],
    flat[0],
    ...flat,
    flat[flat.length - 1],
    [-hw, top - c],
    [-hw, top - c],
    [-hw, rMid],
  ];
  return [...out, ...crisp];
}

/**
 * Outer half resampled at even arc-length steps (so a texture is resolved evenly across the band) and cut by
 * `cut(u)` along the surface normal, followed by the untouched inner half. CCW in (u, r) like bandSection.
 */
function texturedProfile(spec: SectionSpec, nTop: number, cut: (u: number) => number): ProfilePoint[] {
  const c = outerCurve(spec, 160, 0);
  const out: ProfilePoint[] = [];
  for (let i = 0; i <= nTop; i++) {
    const lambda = c.mid - (c.total * i) / nTop;
    const q = onCurve(c, lambda);
    const d = i === 0 || i === nTop ? 0 : cut(q.u - (spec.u0 ?? 0));
    out.push([q.u - d * q.nu, q.r - d * q.nr]);
  }
  const full = bandSection({ ...spec, n: 24 });
  // bandSection's inner half: indices 13..23 (a in (PI, 2PI))
  for (let k = 13; k < 24; k++) out.push(full[k]);
  return out;
}

/** A section family: profile at theta with its top sampled at nTop steps and cut by `cut(u)`; `field` = half width of the texturable top. */
interface Family {
  profile: (theta: number, nTop: number, cut: (u: number) => number) => ProfilePoint[];
  field: (theta: number) => number;
  /** profile points that are not on the textured top */
  extra: number;
}

/** Sweeps a plain shank, cutting brushed grain or engraved scrollwork into the outer surface when asked. */
function texturedSweep(R: number, tp: Taper, fam: Family, surface: SurfaceTexture, ctx: ShankCtx) {
  const wMax = Math.max(tp.wBottom, tp.wTop);
  if (surface === 'brushed') {
    // grain runs round the ring: only the section needs to be fine
    const nTop = clamp(Math.ceil((wMax * 1.25) / (BRUSH_PITCH / 5)), 24, 96);
    return [
      sweep({
        segments: 160,
        profile: (th) => {
          const f = fam.field(th);
          return fam.profile(th, nTop, (u) => brushedDepth(u, f));
        },
      }),
    ];
  }
  // engraved: a dense sweep over the shoulders, a plain one underneath; both share the same point layout so the
  // seams match exactly (the cut fades out before the seam)
  const rOut = R + tp.tTop;
  const nTop = clamp(Math.ceil((wMax * 1.3) / ENGRAVE_STEP), 24, 56);
  // both sweeps together keep to ~48k triangles
  const segs = Math.max(120, Math.floor(24000 / (nTop + fam.extra)) - 90);
  const zone = Math.min((segs * ENGRAVE_STEP) / (2 * rOut), Math.PI * 0.62);
  const head = headHalfAngle(ctx, rOut) * 0.8;
  const mask = (th: number) => {
    const d = fromTop(th);
    return smooth((d - head) / 0.12) * smooth((zone - d) / 0.1);
  };
  const profile = (th: number) => {
    const m = mask(th);
    const f = fam.field(th);
    const sArc = signedFromTop(th) * rOut;
    return fam.profile(th, nTop, (u) => (m > 0 ? m * engravedDepth(sArc, u, f) : 0));
  };
  return [
    sweep({ thetaStart: TOP - zone, thetaEnd: TOP + zone, segments: segs, profile }),
    sweep({ thetaStart: TOP + zone, thetaEnd: TOP - zone + TAU, segments: 90, profile }),
  ];
}

function plain(
  label: string,
  d: PlainDefaults,
  opts: { knife?: boolean; comfort?: boolean; flat?: boolean } = {},
) {
  return (ctx: ShankCtx): ShankResult => {
    const p = ctx.params;
    const R = ctx.innerRadius;
    const tp = readTaper(p, d);
    // a knife edge has no surface to texture
    const surface = opts.knife ? 'smooth' : str(p, 'surface', SURFACE_TEXTURES, 'smooth');
    let outerExp = outerExpFromRoundness(num(p, 'roundness', d.roundness, 0, 1));
    let innerExp = d.innerExp;
    let split = d.split;
    if (opts.knife) {
      // ridge: exponent < 1 gives concave flanks meeting at a sharp crest
      outerExp = 1.05 - num(p, 'ridgeSharpness', 0.5, 0, 1) * 0.35;
      split = 0.74;
    }
    if (opts.comfort) {
      // pillow section: the inside is domed as much as the outside, so the edges lift clear of the finger
      const dome = num(p, 'innerDome', 0.4, 0.1, 0.6);
      innerExp = 2.1;
      split = 1 - dome;
    }
    const result = (geos: THREE.BufferGeometry[]): ShankResult => ({
      parts: [metal(geos, label)],
      seatY: R + tp.tTop,
      topWidth: tp.wTop,
    });
    if (opts.flat) {
      const chamfer = num(p, 'roundness', d.roundness, 0, 1) * 0.6 + 0.12;
      const fam: Family = {
        profile: (th, nTop, cut) =>
          flatSection(R, widthAt(tp, th), thickAt(tp, th), chamfer, innerExp, nTop, cut),
        field: (th) => widthAt(tp, th) / 2 - chamfer - 0.05,
        extra: 24,
      };
      if (surface === 'smooth')
        return result([sweep({ segments: 160, profile: (th) => fam.profile(th, 1, () => 0) })]);
      return result(texturedSweep(R, tp, fam, surface, ctx));
    }
    const section = (th: number): SectionSpec => ({
      w: widthAt(tp, th),
      t: thickAt(tp, th),
      R,
      outerExp,
      innerExp,
      split,
    });
    if (surface === 'smooth')
      return result([
        sweep({
          segments: 160,
          // the knife's crest point is doubled so the ridge stays a crisp line while the flanks shade smoothly
          profile: (th) => {
            const sec = bandSection({ ...section(th), n: 24 });
            return opts.knife ? [...sec.slice(0, 7), sec[6], ...sec.slice(7)] : sec;
          },
        }),
      ]);
    const fam: Family = {
      profile: (th, nTop, cut) => texturedProfile(section(th), nTop, cut),
      field: (th) => widthAt(tp, th) / 2 - 0.12,
      extra: 11,
    };
    return result(texturedSweep(R, tp, fam, surface, ctx));
  };
}

registerShankBuilder(
  'plain-round',
  // classic "D": a full half-round dome over a flat inside with crisp inner edges
  plain('plain round shank', {
    w: 2.0,
    wTop: 2.2,
    t: 1.7,
    tTop: 1.9,
    taperDeg: 70,
    roundness: 1,
    innerExp: 9,
    split: 0.8,
  }),
);
registerShankBuilder(
  'plain-flat',
  plain(
    'plain flat shank',
    {
      w: 2.2,
      wTop: 2.3,
      t: 1.6,
      tTop: 1.8,
      taperDeg: 70,
      roundness: 0.05,
      innerExp: 5,
      split: 0.5,
    },
    { flat: true },
  ),
);
registerShankBuilder(
  'knife-edge',
  plain(
    'knife-edge shank',
    { w: 2.2, wTop: 2.3, t: 2.0, tTop: 2.2, taperDeg: 70, roundness: 0, innerExp: 4, split: 0.74 },
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
  // a fine round wire: about 1.3 mm across, nearly circular in section
  plain('dainty shank', {
    w: 1.3,
    wTop: 1.5,
    t: 1.25,
    tTop: 1.4,
    taperDeg: 60,
    roundness: 1,
    innerExp: 2.2,
    split: 0.5,
  }),
);
registerShankBuilder(
  'comfort-fit',
  plain(
    'comfort-fit shank',
    { w: 2.5, wTop: 2.6, t: 2.1, tTop: 2.2, taperDeg: 70, roundness: 0.85, innerExp: 2.1, split: 0.6 },
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
  const depth = num(p, 'dentDepthMm', 0.15, 0, 0.3);
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
  // smooth normals over a fine mesh: round hollows with bright ridges between them
  const g = sweep({
    segments: 420,
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
