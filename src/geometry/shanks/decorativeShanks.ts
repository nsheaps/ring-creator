/** Decorated shanks: milgrain edges, vintage filigree, leaf-vine and twig. */
import * as THREE from 'three';
import { registerShankBuilder } from '../builders';
import type { ShankCtx, ShankResult } from '../types';
import type { ProfilePoint } from '../helpers';
import { toFlat } from '../helpers';
import {
  TAU,
  TOP,
  bandSection,
  beadGeometry,
  beadRow,
  clamp,
  finish,
  fromTop,
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
  sweep,
  taperedBand,
  thickAt,
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
// Vintage filigree: a band with open scroll loops on both side walls and milgrain edges.
// ---------------------------------------------------------------------------------------------
function vintageFiligree(ctx: ShankCtx): ShankResult {
  const p = ctx.params;
  const R = ctx.innerRadius;
  const tp = readTaper(p, { w: 2.4, wTop: 2.8, t: 2.0, tTop: 2.2, taperDeg: 70 });
  const band = taperedBand(R, tp, {
    outerExp: outerExpFromRoundness(num(p, 'roundness', 0.35, 0, 1)),
    innerExp: 3,
    split: 0.55,
  });
  const coverage = num(p, 'coverage', 0.6, 0.1, 1);
  const loopMm = num(p, 'loopMm', 0.9, 0.5, 1.6);
  const wire = clamp(loopMm * 0.13, 0.08, 0.2);
  const rMidOut = R + tp.tBottom * 0.5;
  const a0 = headHalfAngle(ctx, rMidOut) * 0.85;
  const a1 = Math.max(a0, coverage * Math.PI);
  const pitch = loopMm * 1.05;
  const loopGeo = toFlat(new THREE.TorusGeometry(loopMm / 2 - wire, wire, 5, 14));
  const dotGeo = beadGeometry(wire * 1.6, 6, 4);
  const loops: THREE.Matrix4[] = [];
  const dots: THREE.Matrix4[] = [];
  const one = spacedAngles(a0, a1, rMidOut, pitch);
  const angles = [...one.map((a) => TOP - a), ...one.map((a) => TOP + a)];
  angles.forEach((th, i) => {
    const t = thickAt(tp, th);
    const w = widthAt(tp, th);
    const scale = i % 2 === 0 ? 1 : 0.8;
    const r = R + t * 0.5;
    for (const side of [-1, 1]) {
      const z = side * (w / 2 + wire * 0.4);
      // torus lies in the XY plane (axis Z): flat against the side wall
      const m = new THREE.Matrix4()
        .makeTranslation(r * Math.cos(th), r * Math.sin(th), z)
        .multiply(new THREE.Matrix4().makeScale(scale, scale, 1));
      loops.push(m);
      dots.push(new THREE.Matrix4().makeTranslation(r * Math.cos(th), r * Math.sin(th), z));
    }
  });
  const beadR = num(p, 'beadMm', 0.3, 0.2, 0.6) / 2;
  const rOut = R + tp.tBottom;
  const ms: THREE.Matrix4[] = [];
  // milgrain along the outer edges where the band is decorated (follows the taper)
  for (const th of spacedAngles(TOP - a1, TOP + a1, rOut, beadR * 2.3)) {
    const t = thickAt(tp, th);
    const w = widthAt(tp, th);
    for (const side of [-1, 1]) ms.push(ringFrame(th, R + t - beadR * 0.55, side * (w / 2 - beadR * 1.1)));
  }
  const geos = [
    band,
    instances(loopGeo, loops),
    instances(dotGeo, dots),
    instances(beadGeometry(beadR, 6, 4), ms),
  ];
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
// Leaf-vine: a slim wandering stem with small leaves sprouting along the shoulders.
// ---------------------------------------------------------------------------------------------
function leafGeometry(len: number, wid: number, thick: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(len * 0.45, wid * 0.75, len, 0);
  s.quadraticCurveTo(len * 0.45, -wid * 0.75, 0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -thick / 2);
  return toFlat(g);
}

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
  const stem = sweep({
    segments: 200,
    zOffset: wig,
    profile: (th) => {
      const v = noise(ws, th, 0);
      return bandSection({
        w: widthAt(tp, th) * (1 + 0.12 * v),
        t: thickAt(tp, th) * (1 + 0.06 * v),
        R,
        outerExp: 2.4,
        innerExp: 3,
        split: 0.6,
      });
    },
  });
  const r = rng(seed * 31 + 5);
  const leaf = leafGeometry(leafLen, leafLen * 0.42, 0.22);
  const rOut = R + tp.tBottom;
  const a0 = headHalfAngle(ctx, rOut) + 0.05;
  const a1 = Math.max(a0 + 0.05, coverage * Math.PI);
  const ms: THREE.Matrix4[] = [];
  for (let i = 0; i < leafCount; i++) {
    const shoulder = i % 2 === 0 ? -1 : 1; // alternate shoulders
    const sideZ = Math.floor(i / 2) % 2 === 0 ? 1 : -1; // and alternate sides of the stem
    const f = (Math.floor(i / 2) + 0.5) / Math.ceil(leafCount / 2);
    const th = TOP + shoulder * (a0 + (a1 - a0) * f + (r() - 0.5) * 0.04);
    const t = thickAt(tp, th);
    const w = widthAt(tp, th);
    const scale = 0.75 + r() * 0.35;
    const ang = (40 + r() * 25) * (Math.PI / 180);
    // leaf frame: X along the leaf, Z = radial outward (leaf faces up), base at the stem's side
    const c = Math.cos(th);
    const sn = Math.sin(th);
    const er = new THREE.Vector3(c, sn, 0);
    const et = new THREE.Vector3(-sn, c, 0).multiplyScalar(-shoulder); // leaf points away from the head
    const ez = new THREE.Vector3(0, 0, sideZ);
    const d = et.clone().multiplyScalar(Math.cos(ang)).addScaledVector(ez, Math.sin(ang)).normalize();
    // droop the tip towards the band surface, but never below the finger hole
    const tilt = -Math.min(0.35, Math.asin(clamp((t * 0.8 - 0.25) / (leafLen * scale), 0, 1)));
    const dd = d.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(er, Math.sin(tilt)).normalize();
    const y = new THREE.Vector3().crossVectors(er, dd).normalize();
    const zAxis = new THREE.Vector3().crossVectors(dd, y).normalize();
    const base = new THREE.Vector3(c, sn, 0)
      .multiplyScalar(R + t * 0.8)
      .add(new THREE.Vector3(0, 0, wig(th) + sideZ * w * 0.25));
    const m = new THREE.Matrix4().makeBasis(dd, y, zAxis).scale(new THREE.Vector3(scale, scale, 1));
    m.setPosition(base);
    ms.push(m);
  }
  const geos = [stem];
  if (ms.length) geos.push(instances(leaf, ms));
  return { parts: [metal(geos, 'leaf-vine shank')], seatY: R + tp.tTop, topWidth: tp.wTop };
}
registerShankBuilder('leaf-vine', leafVine);

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
  const rOut = R + tp.tBottom;
  const a0 = headHalfAngle(ctx, rOut) + 0.08;
  for (let i = 0; i < knots; i++) {
    const shoulder = i % 2 === 0 ? 1 : -1;
    const th = TOP + shoulder * (a0 + r() * (Math.PI * 0.75 - a0));
    if (fromTop(th) < a0) continue;
    const t = thickAt(tp, th);
    const w = widthAt(tp, th);
    const side = r() < 0.5 ? -1 : 1;
    const er = new THREE.Vector3(Math.cos(th), Math.sin(th), 0);
    const et = new THREE.Vector3(-Math.sin(th), Math.cos(th), 0).multiplyScalar(-shoulder);
    const a = new THREE.Vector3()
      .copy(er)
      .multiplyScalar(R + t * 0.6)
      .add(new THREE.Vector3(0, 0, side * w * 0.2));
    const dir = er
      .clone()
      .multiplyScalar(0.55)
      .addScaledVector(et, 0.5)
      .add(new THREE.Vector3(0, 0, side * 0.65))
      .normalize();
    const len = 0.7 + r() * 0.6;
    const b = a.clone().addScaledVector(dir, len + w * 0.3);
    const rad = 0.28 + r() * 0.12;
    nubs.push(
      finish(
        new THREE.CylinderGeometry(rad * 0.75, rad, a.distanceTo(b), 8, 1, false).applyMatrix4(alignY(a, b)),
      ),
    );
  }
  return { parts: [metal([g, ...nubs], 'twig shank')], seatY: R + tp.tTop, topWidth: tp.wTop };
}
registerShankBuilder('twig', twig);

/** Matrix that maps a Y-axis cylinder centred at the origin onto the segment a -> b. */
function alignY(a: THREE.Vector3, b: THREE.Vector3): THREE.Matrix4 {
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  return new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
}
