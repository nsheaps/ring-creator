/** Decorated shanks: milgrain edges, vintage filigree, leaf-vine and twig. */
import * as THREE from 'three';
import { registerShankBuilder } from '../builders';
import type { ShankCtx, ShankResult } from '../types';
import { curveFrom, surfaceMapFrom, type OuterCurve, type ProfilePoint } from '../helpers';
import {
  TAU,
  TOP,
  bandSection,
  beadGeometry,
  beadRow,
  clamp,
  finish,
  headHalfAngle,
  instances,
  metal,
  num,
  outerExpFromRoundness,
  pinInner,
  readTaper,
  ringFrame,
  rng,
  spacedAngles,
  surfaceLeaf,
  surfaceMap,
  surfaceWire,
  sweep,
  taperedBand,
  thickAt,
  type SectionSpec,
  topness,
  widthAt,
} from './common';

/** Bead rows along both outer edges of a band, over the angle range [a0, a1]. */
function edgeBeads(
  R: number,
  t: number,
  w: number,
  beadR: number,
  a0: number,
  a1: number,
  inset: number,
): THREE.Matrix4[] {
  const r = R + t - beadR * 0.55;
  const z = w / 2 - inset;
  return [...beadRow(r, z, beadR, a0, a1), ...beadRow(r, -z, beadR, a0, a1)];
}

// ---------------------------------------------------------------------------------------------
// Milgrain: a flat-topped band with rows of tiny beads along both edges, all the way round.
// ---------------------------------------------------------------------------------------------
function milgrain(ctx: ShankCtx): ShankResult {
  const p = ctx.params;
  const R = ctx.innerRadius;
  // constant section: the bead rows need a constant edge
  const w = num(p, 'widthMm', 2.3, 1.5, 5);
  const t = num(p, 'thicknessMm', 1.8, 1.2, 3);
  const beadR = num(p, 'beadMm', 0.36, 0.2, 0.7) / 2;
  const rows = Math.round(num(p, 'rows', 2, 2, 3));
  const tp = { wBottom: w, wTop: w, tBottom: t, tTop: t, span: 1 };
  const band = taperedBand(R, tp, {
    outerExp: outerExpFromRoundness(num(p, 'roundness', 0.25, 0, 1)),
    innerExp: 3,
    split: 0.55,
  });
  const ms = edgeBeads(R, t, w, beadR, 0, TAU - (beadR * 2.3) / (R + t), beadR * 1.1);
  if (rows === 3) ms.push(...beadRow(R + t - beadR * 0.4, 0, beadR, 0, TAU - (beadR * 2.3) / (R + t)));
  return {
    parts: [metal([band, instances(beadGeometry(beadR, 6, 4), ms)], 'milgrain shank')],
    seatY: R + t,
    topWidth: w,
  };
}
registerShankBuilder('milgrain', milgrain);

// ---------------------------------------------------------------------------------------------
// Vintage filigree: a band whose side walls carry a raised running scroll (a wire wave with a curl in every bay)
// along the shoulders, with milgrain beads on the outer edges.
// ---------------------------------------------------------------------------------------------

/** The +u (side = 1) or -u (side = -1) side wall of a section as a curve: lambda = 0 at the wall's midline, outward normal. */
function wallCurve(sp: SectionSpec, side: number, m = 40): OuterCurve {
  const hTop = sp.t * sp.split;
  const hBot = sp.t - hTop;
  const rMid = sp.R + hBot;
  const pts: ProfilePoint[] = [];
  for (let i = 0; i <= m; i++) {
    const a = -1.25 + (2.5 * i) / m;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const e = sn >= 0 ? sp.outerExp : sp.innerExp;
    const h = sn >= 0 ? hTop : hBot;
    pts.push([side * (sp.w / 2) * c ** (2 / e), rMid + h * Math.sign(sn) * Math.abs(sn) ** (2 / e)]);
  }
  // walk bottom -> top on the +u wall and top -> bottom on the -u wall so the normal points out of the band
  const c = curveFrom(side > 0 ? pts : pts.reverse());
  return { ...c, mid: c.cum[m / 2] };
}

function vintageFiligree(ctx: ShankCtx): ShankResult {
  const p = ctx.params;
  const R = ctx.innerRadius;
  const tp = readTaper(p, { w: 2.4, wTop: 2.8, t: 2.0, tTop: 2.2, taperDeg: 70 });
  const outerExp = outerExpFromRoundness(num(p, 'roundness', 0.35, 0, 1));
  const sectionAt = (th: number): SectionSpec => ({
    w: widthAt(tp, th),
    t: thickAt(tp, th),
    R,
    outerExp,
    innerExp: 3,
    split: 0.55,
  });
  const band = sweep({ segments: 160, profile: (th) => bandSection({ ...sectionAt(th), n: 24 }) });
  const coverage = num(p, 'coverage', 0.6, 0.1, 1);
  const loopMm = num(p, 'loopMm', 0.9, 0.5, 1.6);
  const tMin = Math.min(tp.tBottom, tp.tTop);
  const wallHalf = tMin * 0.45 * 0.55;
  const amp = Math.min(loopMm * 0.33, wallHalf * 0.6);
  const curlR = Math.min(loopMm * 0.25, wallHalf * 0.6);
  const wire = clamp(loopMm * 0.1, 0.07, 0.12);
  const period = Math.max(loopMm * 2, curlR * 5.5);
  const k = TAU / period;
  const rRef = R + (tp.tBottom + tp.tTop) / 2;
  const a0 = headHalfAngle(ctx, R + tp.tTop) * 0.85;
  const a1 = Math.max(a0 + 0.2, coverage * Math.PI);
  const sA = a0 * rRef;
  const sB = a1 * rRef;
  // rows per mm along the scroll, scaled so the whole ornament keeps to its triangle budget
  const motifs = Math.max(1, Math.floor(((sB - sA) * 2) / period));
  const sides = 6;
  const budget = 15000;
  const perMm = clamp(budget / (4 * 2 * sides * (sB - sA + motifs * 0.6 * curlR * 9)), 4, 22);
  const geos: THREE.BufferGeometry[] = [band];
  for (const wallSide of [1, -1]) {
    const map = surfaceMapFrom((th) => wallCurve(sectionAt(th), wallSide), rRef);
    // lambda runs down the +u wall and up the -u wall: flip so the motif is a mirror image on both sides
    const L = (l: number) => -wallSide * l;
    for (const shoulder of [1, -1]) {
      const wave = (s: number) => amp * Math.sin(k * (s - sA));
      geos.push(
        finish(
          surfaceWire(
            map,
            (f) => {
              const s = sA + (sB - sA) * f;
              return [shoulder * s, L(wave(s))];
            },
            Math.max(16, Math.round((sB - sA) * perMm)),
            (f) => wire * Math.min(1, Math.min(f, 1 - f) * 12 + 0.35),
            0.06,
            sides,
          ),
        ),
      );
      // a curl hangs inside every crest and trough, winding in from the wave
      for (let j = 0; j < motifs; j++) {
        const sc = sA + period / 4 + (j * period) / 2;
        if (sc + curlR > sB) break;
        const sg = j % 2 === 0 ? 1 : -1; // crest (+) or trough (-)
        const turns = 1.35;
        const cs = sc;
        const cl = sg * (amp - curlR);
        geos.push(
          finish(
            surfaceWire(
              map,
              (f) => {
                const psi = f * turns * TAU;
                const rho = curlR * (1 - 0.7 * f);
                return [shoulder * (cs + rho * Math.sin(psi)), L(cl + sg * rho * Math.cos(psi))];
              },
              Math.max(14, Math.round(turns * TAU * curlR * perMm * 1.4)),
              (f) => wire * (1 - 0.35 * f),
              0.06,
              sides,
            ),
          ),
        );
      }
    }
  }
  const beadR = num(p, 'beadMm', 0.3, 0.2, 0.6) / 2;
  const ms: THREE.Matrix4[] = [];
  // milgrain along the outer edges where the band is decorated (follows the taper)
  for (const th of spacedAngles(TOP - a1, TOP + a1, R + tp.tBottom, beadR * 2.3)) {
    const t = thickAt(tp, th);
    const w = widthAt(tp, th);
    for (const side of [-1, 1]) ms.push(ringFrame(th, R + t - beadR * 0.55, side * (w / 2 - beadR * 1.1)));
  }
  geos.push(instances(beadGeometry(beadR, 6, 4), ms));
  return { parts: [metal(geos, 'vintage filigree shank')], seatY: R + tp.tTop, topWidth: tp.wTop };
}
registerShankBuilder('vintage-filigree', vintageFiligree);

// ---------------------------------------------------------------------------------------------
// Organic helpers: smooth periodic noise with integer frequencies so it wraps around the ring.
// ---------------------------------------------------------------------------------------------
interface Wave {
  f: number;
  g: number;
  ph: number;
  amp: number;
}
function waves(seed: number, count: number, fMin: number, fMax: number): Wave[] {
  const r = rng(seed);
  return Array.from({ length: count }, () => ({
    f: Math.round(fMin + r() * (fMax - fMin)),
    g: Math.round(r() * 3),
    ph: r() * TAU,
    amp: 0.4 + r() * 0.6,
  }));
}
function noise(ws: Wave[], theta: number, a: number): number {
  let s = 0;
  let n = 0;
  for (const w of ws) {
    s += w.amp * Math.sin(w.f * theta + w.g * a + w.ph);
    n += w.amp;
  }
  return n > 0 ? s / n : 0;
}

// ---------------------------------------------------------------------------------------------
// Leaf-vine: a slim wandering stem; on each shoulder a raised vine tendril runs along the top of the band and
// small leaves branch off it, lying flat on the metal (each leaf's underside is sunk into the band).
// ---------------------------------------------------------------------------------------------
function leafVine(ctx: ShankCtx): ShankResult {
  const p = ctx.params;
  const R = ctx.innerRadius;
  const tp = readTaper(p, { w: 1.6, wTop: 2.0, t: 1.5, tTop: 1.8, taperDeg: 50 });
  const seed = Math.round(num(p, 'seed', 3, 1, 9999));
  const wander = num(p, 'wanderMm', 0.3, 0, 0.8);
  const leafCount = Math.round(num(p, 'leaves', 14, 0, 30));
  const leafLen = num(p, 'leafMm', 2.2, 1, 3.5);
  const coverage = num(p, 'coverage', 0.55, 0.1, 1);
  const ws = waves(seed, 4, 3, 9);
  const k = 5 + (seed % 3);
  const wig = (th: number) => wander * Math.sin(k * th) * (1 - topness(th, tp.span));
  const sectionAt = (th: number) => {
    const v = noise(ws, th, 0);
    return {
      w: widthAt(tp, th) * (1 + 0.12 * v),
      t: thickAt(tp, th) * (1 + 0.06 * v),
      R,
      outerExp: 2.4,
      innerExp: 3,
      split: 0.6,
    };
  };
  const stem = sweep({ segments: 200, zOffset: wig, profile: (th) => bandSection(sectionAt(th)) });
  const rRef = R + (tp.tBottom + tp.tTop) / 2;
  const map = surfaceMap(sectionAt, rRef, wig);
  const r = rng(seed * 31 + 5);
  const rOut = R + tp.tTop;
  const a0 = headHalfAngle(ctx, rOut) + 0.04;
  const a1 = Math.max(a0 + 0.25, coverage * Math.PI);
  const sA = a0 * rRef;
  const sB = a1 * rRef;
  const geos: THREE.BufferGeometry[] = [stem];
  const perSide = Math.ceil(leafCount / 2);
  const wireR = clamp(Math.min(tp.wBottom, tp.wTop) * 0.11, 0.12, 0.22);
  for (const side of [1, -1]) {
    // tendril: a gentle S-curve across the top of the band (lambda), tapering at its ends
    const amp = Math.min(tp.wBottom, tp.wTop) * 0.22;
    const period = clamp(leafLen * 2.4, 3, 8);
    const ph = r() * TAU;
    const lam = (s: number) => amp * Math.sin((TAU * s) / period + ph);
    const path = (f: number): [number, number] => {
      const s = sA + (sB - sA) * f;
      return [side * s, side * lam(s)];
    };
    const n = Math.max(24, Math.round((sB - sA) / 0.18));
    geos.push(
      surfaceWire(
        map,
        path,
        n,
        (f) => wireR * (0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, f * 1.1)) ** 0.4),
      ),
    );
    // leaves: alternate sides of the tendril, pointing away from the head, lying along the surface
    const count = side > 0 ? perSide : leafCount - perSide;
    for (let i = 0; i < count; i++) {
      const f = (i + 0.35 + (r() - 0.5) * 0.2) / count;
      const s = sA + (sB - sA) * f;
      const slope = (lam(s + 0.01) - lam(s - 0.01)) / 0.02;
      const across = i % 2 === 0 ? 1 : -1;
      const scale = 0.8 + r() * 0.3;
      const ang = Math.atan(slope) + across * (0.5 + r() * 0.25);
      geos.push(
        surfaceLeaf(map, {
          s: side * s,
          lambda: side * lam(s),
          // the other shoulder is the same layout turned 180 degrees in the (s, lambda) plane
          angle: side > 0 ? ang : ang + Math.PI,
          length: leafLen * scale,
          width: leafLen * scale * 0.46,
          thick: clamp(leafLen * 0.12, 0.2, 0.36),
          curl: across * 0.08,
        }),
      );
    }
  }
  return {
    parts: [metal(geos.map(finishIfIndexed), 'leaf-vine shank')],
    seatY: R + tp.tTop,
    topWidth: tp.wTop,
  };
}
registerShankBuilder('leaf-vine', leafVine);

function finishIfIndexed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  return g.getIndex() ? finish(g) : g;
}

// ---------------------------------------------------------------------------------------------
// Twig: a knobbly branch with bark-like ripples and a few cut-off side shoots.
// ---------------------------------------------------------------------------------------------
function twig(ctx: ShankCtx): ShankResult {
  const p = ctx.params;
  const R = ctx.innerRadius;
  const tp = readTaper(p, { w: 1.9, wTop: 2.2, t: 1.8, tTop: 2.0, taperDeg: 50 });
  const seed = Math.round(num(p, 'seed', 11, 1, 9999));
  const bark = num(p, 'barkMm', 0.12, 0, 0.3);
  const knots = Math.round(num(p, 'knots', 6, 0, 14));
  const ws = waves(seed, 6, 4, 23);
  const n = 20;
  const g = sweep({
    segments: 240,
    profile: (th) => {
      const w = widthAt(tp, th) * (1 + 0.08 * noise(ws, th * 0.5, 1));
      const t = thickAt(tp, th);
      const base = bandSection({ w, t, R, outerExp: 2.2, innerExp: 2.4, split: 0.55, n });
      const cu = 0;
      const cr = R + t * 0.45;
      const out = base.map(([u, rr], k): ProfilePoint => {
        const a = (k / n) * TAU;
        // the inner face stays smooth (finger side); bark ripples on the outside
        const f = clamp(Math.sin(a) + 0.6, 0, 1);
        const d = bark * f * noise(ws, th, a);
        const du = u - cu;
        const dr = rr - cr;
        const len = Math.hypot(du, dr) || 1;
        return [u + (du / len) * d, rr + (dr / len) * d];
      });
      return pinInner(out, R);
    },
  });
  const r = rng(seed * 17 + 3);
  const nubs: THREE.BufferGeometry[] = [];
  const rRef = R + (tp.tBottom + tp.tTop) / 2;
  // shoots grow out of the bark: short stubs leaving the branch at a slant, rising off the surface, cut square
  const map = surfaceMap(
    (th) => ({ w: widthAt(tp, th), t: thickAt(tp, th), R, outerExp: 2.2, innerExp: 2.4, split: 0.55 }),
    rRef,
  );
  const a0 = headHalfAngle(ctx, R + tp.tTop) + 0.1;
  for (let i = 0; i < knots; i++) {
    const shoulder = i % 2 === 0 ? 1 : -1;
    const th = a0 + r() * (Math.PI * 0.75 - a0);
    const s0 = shoulder * th * rRef;
    const across = r() < 0.5 ? -1 : 1;
    const l0 = across * r() * 0.25;
    const len = 0.7 + r() * 0.5;
    // shoots leave the branch at a slant, mostly along it, so they stay on the top of the band
    const ang = (0.3 + r() * 0.3) * across;
    const rad = 0.24 + r() * 0.08;
    const rise = 0.15 + r() * 0.15;
    nubs.push(
      finish(
        surfaceWire(
          map,
          (f) => [s0 + shoulder * f * len * Math.cos(ang), l0 + f * len * Math.sin(ang)],
          10,
          (f) => rad * (1 - 0.25 * f),
          0.25,
          10,
          (f) => rise * f * f,
        ),
      ),
    );
  }
  return { parts: [metal([g, ...nubs], 'twig shank')], seatY: R + tp.tTop, topWidth: tp.wTop };
}
registerShankBuilder('twig', twig);
