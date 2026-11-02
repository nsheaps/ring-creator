/**
 * Leaf-vine bypass head: the centre stone sits in claw prongs while two twig-like branches rise out of the shank from
 * either end of the band, sweep past opposite sides of the stone like a bypass and run on beyond it. Free-standing
 * leaves of mixed sizes (flat metal blades with a raised midrib, or marquise stones in a thin leaf seat) sprout off both
 * sides of each branch, the first tucked into the crook between twig and stone, with optional small round "bud" stones
 * of varied sizes on short stalks. Two short sprigs fork off each branch, one off the climb and one near the root that
 * runs back down the shoulder, each ending in a smaller leaf, so the foliage spreads along the band. The branches are
 * nearly point symmetric: the one rising from the +band end wraps the +across side of the stone, the other the
 * opposite side, with slightly different roots, spacing and leaf sizes.
 */
import * as THREE from 'three';
import { registerHeadBuilder } from '../builders';
import type { BuiltStone, HeadCtx, Part } from '../types';
import { loftRows, toFlat } from '../helpers';
import {
  accentPart,
  ball,
  bool,
  cleanOutline,
  loop,
  metalPart,
  num,
  prongSet,
  ringDrop,
  rod,
  shankTopRadius,
  signedVolume,
  str,
  v3,
} from './common';
import { radialPoint } from './frameOutline';
import { prongOpts } from './prongHeads';

const LEAF_STYLES = ['metal', 'stone'] as const;
const TWIG_PROFILES = ['round', 'flat'] as const;
const LEAF_SEATS = ['wire', 'box'] as const;

/** 0..1 climb profile: eases in over the first 35 %, rises at a steady slope, levels off over the last 20 %. */
const climb = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  const a = 0.35;
  const b = 0.2;
  const vm = 1 / (1 - (a + b) / 2);
  if (x < a) return (vm * x * x) / (2 * a);
  if (x < 1 - b) return vm * (a / 2 + x - a);
  return 1 - (vm * (1 - x) ** 2) / (2 * b);
};

/** Closed indexed loft -> outward winding, smooth normals, flat (non-indexed) buffer. */
function solid(rows: THREE.Vector3[][]): THREE.BufferGeometry {
  const g = loftRows(rows);
  if (signedVolume(g) < 0) {
    const idx = g.getIndex();
    if (idx) {
      const arr = idx.array as Uint16Array | Uint32Array;
      for (let k = 0; k + 2 < arr.length; k += 3) {
        const t = arr[k + 1];
        arr[k + 1] = arr[k + 2];
        arr[k + 2] = t;
      }
      idx.needsUpdate = true;
    }
  }
  g.computeVertexNormals();
  return toFlat(g);
}

/** Frame square to direction t: a horizontal lateral axis and an upward-facing normal. */
function frame(t: THREE.Vector3): { lat: THREE.Vector3; up: THREE.Vector3 } {
  const lat = v3(-t.z, 0, t.x);
  if (lat.lengthSq() < 1e-9) lat.set(1, 0, 0);
  lat.normalize();
  const up = lat.clone().cross(t).normalize();
  if (up.y < 0) up.negate();
  return { lat, up };
}

interface TwigPt {
  p: THREE.Vector3;
  r: number;
}

/**
 * Cross-section of a twig: round wire, or a flat ribbon `ratio` times wider than it is thick (a rounded rectangle with
 * its flat top facing up, of the same area as the round wire of the sample's radius).
 */
interface TwigProfile {
  flat: boolean;
  ratio: number;
}
const ROUND: TwigProfile = { flat: false, ratio: 1 };

/** Tapered twig through the samples (closed ends), round or flat. */
function twig(pts: TwigPt[], radial = 10, profile: TwigProfile = ROUND): THREE.BufferGeometry {
  if (profile.flat) return ribbon(pts, radial + 2, profile.ratio);
  const rows = pts.map((q, i) => {
    const a = pts[Math.max(0, i - 1)].p;
    const b = pts[Math.min(pts.length - 1, i + 1)].p;
    const t = b.clone().sub(a);
    if (t.lengthSq() < 1e-12) t.set(1, 0, 0);
    t.normalize();
    const { lat, up } = frame(t);
    return Array.from({ length: radial }, (_, k) => {
      const a2 = (k / radial) * Math.PI * 2;
      return q.p
        .clone()
        .addScaledVector(lat, Math.cos(a2) * q.r)
        .addScaledVector(up, Math.sin(a2) * q.r);
    });
  });
  return solid(rows);
}

/** Flat ribbon twig: a superellipse cross-section (straight sides, softly rounded edges) `ratio` wide : 1 thick. */
function ribbon(pts: TwigPt[], radial: number, ratio: number): THREE.BufferGeometry {
  const k = Math.sqrt(ratio);
  const se = (c: number) => Math.sign(c) * Math.abs(c) ** 0.4;
  const rows = pts.map((q, i) => {
    const a = pts[Math.max(0, i - 1)].p;
    const b = pts[Math.min(pts.length - 1, i + 1)].p;
    const t = b.clone().sub(a);
    if (t.lengthSq() < 1e-12) t.set(1, 0, 0);
    t.normalize();
    const { lat, up } = frame(t);
    return Array.from({ length: radial }, (_, j) => {
      const a2 = ((j + 0.5) / radial) * Math.PI * 2;
      return q.p
        .clone()
        .addScaledVector(lat, se(Math.cos(a2)) * q.r * k)
        .addScaledVector(up, se(Math.sin(a2)) * (q.r / k));
    });
  });
  return solid(rows);
}

/**
 * A free-standing metal leaf from `base` along `dir` (unit, may slope): pointed lens outline, a thin blade and a
 * raised midrib, the tip curling up slightly.
 */
function metalLeaf(
  base: THREE.Vector3,
  dir: THREE.Vector3,
  length: number,
  width: number,
): THREE.BufferGeometry {
  const { lat, up } = frame(dir);
  const th = Math.min(0.34, Math.max(0.2, width * 0.22));
  const rib = th * 0.55;
  const nAlong = 12;
  const nAround = 12;
  const rows: THREE.Vector3[][] = [];
  for (let i = 0; i <= nAlong; i++) {
    const xi = 0.02 + (0.96 * i) / nAlong;
    const hw = Math.max(0.03, (width / 2) * ((xi ** 0.7 * (1 - xi) ** 1.1) / 0.3));
    const body = Math.sin(Math.PI * Math.min(1, xi * 1.1)) ** 0.5;
    const ribAlong = (1 - xi) ** 0.5;
    const c = base
      .clone()
      .addScaledVector(dir, xi * length)
      .addScaledVector(up, 0.12 * length * xi * xi);
    const row: THREE.Vector3[] = [];
    for (let k = 0; k < nAround; k++) {
      const phi = (k / nAround) * Math.PI * 2;
      const cv = Math.cos(phi);
      const sn = Math.sin(phi);
      const h =
        sn >= 0
          ? (th * 0.5 * (0.4 + 0.6 * body) + rib * ribAlong * Math.exp(-((cv / 0.2) ** 2))) * sn ** 0.6
          : -th * 0.45 * (0.4 + 0.6 * body) * (-sn) ** 0.6;
      row.push(
        c
          .clone()
          .addScaledVector(lat, cv * hw)
          .addScaledVector(up, h),
      );
    }
    rows.push(row);
  }
  return solid(rows);
}

/** Basis matrix placing a stone-frame object at c with its +X along dir (table up). */
function basisAt(c: THREE.Vector3, dir: THREE.Vector3): THREE.Matrix4 {
  const X = dir.clone().normalize();
  const Y = v3(0, 1, 0).addScaledVector(X, -X.y).normalize();
  const Z = X.clone().cross(Y).normalize();
  return new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(c);
}

/**
 * A small stone in a thin seat: a wire rim just under the girdle, four bead prongs, and a stalk from `from` to the rim
 * point nearest it (or, with `box`, a box seat: see `boxSeat`). Returns the metal and the placed stone.
 */
function seatedStone(
  stone: BuiltStone,
  m: THREE.Matrix4,
  from: THREE.Vector3,
  wireR: number,
  box = false,
): { metal: THREE.BufferGeometry[]; stone: THREE.BufferGeometry } {
  if (box) return boxSeat(stone, m, from, wireR);
  const o = cleanOutline(stone.outline);
  const rimY = -Math.min(0.12, stone.pavilionDepth * 0.3);
  const rim = o.pts.map(([x, z]) => {
    const l = Math.hypot(x, z) || 1;
    return v3(x + (x / l) * 0.04, rimY, z + (z / l) * 0.04).applyMatrix4(m);
  });
  // (a 0.13 mm wire round a 1 to 4 mm stone stays smooth with ~24 segments; more only costs triangles)
  const metal: THREE.BufferGeometry[] = [loop(rim, wireR, Math.min(24, Math.max(16, rim.length)), 6)];
  // bead prongs at the ends and sides of the stone
  const L = Math.max(...o.pts.map((q) => Math.abs(q[0])));
  const W = Math.max(...o.pts.map((q) => Math.abs(q[1])));
  const beadR = wireR * 1.45;
  for (const [x, z] of [
    [L, 0],
    [-L, 0],
    [0, W],
    [0, -W],
  ] as const)
    metal.push(ball(v3(x * 1.01, 0.02, z * 1.01).applyMatrix4(m), beadR, 1));
  // stalk to the nearest rim point
  let near = rim[0];
  for (const q of rim) if (q.distanceTo(from) < near.distanceTo(from)) near = q;
  metal.push(...rod(from, near, wireR * 1.4, wireR, 8));
  return { metal, stone: stone.geometry.clone().applyMatrix4(m) };
}

/** A light open claw shaft from `a` (buried in the seat) to `b` (capped by a bead), without `rod`'s end balls. */
function peg(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number): THREE.BufferGeometry {
  const len = Math.max(1e-3, a.distanceTo(b));
  const g = new THREE.CylinderGeometry(rb, ra, len, 6, 1, true).translate(0, len / 2, 0);
  const dir = b.clone().sub(a).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), dir)).translate(a.x, a.y, a.z);
  return toFlat(g);
}

/**
 * A marquise leaf in a box seat: a small raised box with straight sides and a flat top just under the girdle, shorter
 * than the stone so its tips run out to a claw at each end, with a tiny claw rising from each corner of the box onto
 * the girdle, and a stalk from `from` to the box's foot.
 */
function boxSeat(
  stone: BuiltStone,
  m: THREE.Matrix4,
  from: THREE.Vector3,
  wireR: number,
): { metal: THREE.BufferGeometry[]; stone: THREE.BufferGeometry } {
  const o = cleanOutline(stone.outline);
  const L = Math.max(...o.pts.map((q) => Math.abs(q[0])));
  const W = Math.max(...o.pts.map((q) => Math.abs(q[1])));
  // the stone's half width at a point along it
  const halfW = (x: number) => {
    let w = 0;
    for (const [px, pz] of o.pts) if (Math.abs(Math.abs(px) - x) < L * 0.12) w = Math.max(w, Math.abs(pz));
    return w;
  };
  // shorter than the stone, a little wider than it so the box's straight sides show beside the girdle
  const a = L * 0.6;
  const b = W + 0.16;
  const cr = Math.min(a, b) * 0.22;
  const yTop = -Math.min(0.12, stone.pavilionDepth * 0.3);
  const yBot = -stone.pavilionDepth - 0.08;
  // rounded rectangle, 4 points on each corner arc
  const rect = (sa: number, sb: number, y: number): THREE.Vector3[] => {
    const out: THREE.Vector3[] = [];
    const corners: [number, number, number][] = [
      [sa - cr, sb - cr, 0],
      [-(sa - cr), sb - cr, Math.PI / 2],
      [-(sa - cr), -(sb - cr), Math.PI],
      [sa - cr, -(sb - cr), (3 * Math.PI) / 2],
    ];
    for (const [cx, cz, a0] of corners)
      for (let k = 0; k < 4; k++) {
        const t = a0 + (k / 3) * (Math.PI / 2);
        out.push(v3(cx + Math.cos(t) * cr, y, cz + Math.sin(t) * cr).applyMatrix4(m));
      }
    return out;
  };
  const bevel = Math.min(0.1, (yTop - yBot) * 0.25);
  const rows = [
    rect(a - bevel, b - bevel, yBot),
    rect(a, b, yBot + bevel),
    rect(a, b, yTop - bevel),
    rect(a - bevel, b - bevel, yTop),
  ];
  const g = loftRows(rows);
  if (signedVolume(g) < 0) rows.reverse();
  // faceted: the box keeps crisp edges
  const boxGeo = toFlat(loftRows(rows));
  boxGeo.computeVertexNormals();
  const metal: THREE.BufferGeometry[] = [boxGeo];
  const clawR = wireR * 1.3;
  // tiny claws from the box corners up onto the girdle
  for (const sx of [1, -1])
    for (const sz of [1, -1]) {
      const x = (a - cr * 0.6) * sx;
      const foot = v3(x, yTop - 0.05, (b - cr * 0.6) * sz).applyMatrix4(m);
      const tip = v3(x * 0.95, 0.05, (halfW(Math.abs(x)) + clawR * 0.3) * sz).applyMatrix4(m);
      metal.push(peg(foot, tip, clawR * 1.2, clawR), ball(tip, clawR * 1.15, 0));
    }
  // a claw at each tip of the stone, reached by a short arm from the box end
  for (const sx of [1, -1]) {
    const foot = v3(a * sx, yTop - 0.05, 0).applyMatrix4(m);
    const tip = v3(L * 1.01 * sx, 0.02, 0).applyMatrix4(m);
    metal.push(peg(foot, tip, wireR * 1.4, wireR * 1.2), ball(tip, wireR * 1.45, 1));
  }
  // stalk to the nearest point of the box's foot
  let near = rows[1][0];
  for (const q of [...rows[0], ...rows[1]]) if (q.distanceTo(from) < near.distanceTo(from)) near = q;
  metal.push(...rod(from, near, wireR * 1.4, wireR, 8));
  return { metal, stone: stone.geometry.clone().applyMatrix4(m) };
}

/**
 * Params: `leafCount` (leaves per branch, the last one at its tip), `leafSize` (leaf length), `branchThickness`,
 * `budStones` (small round stones on stalks per branch; with two or more, one sits on the root sprig), `wrap` (degrees each branch runs round the stone past its
 * middle), `leafStyle` ('metal' blades or 'stone' marquise leaves), `hand` ('right': the +band branch wraps the +across
 * side; 'left' mirrors the swirl), `twigProfile` ('round' wire or 'flat' ribbon, `twigRatio` wide : 1 thick), `leafSeat`
 * ('wire' rim or 'box' seat for marquise leaves), plus the centre prongs (`prongCount`, `prongStyle`).
 */
function leafVineBypass(ctx: HeadCtx): Part[] {
  const p = ctx.params;
  const built = ctx.center.built;
  const o = cleanOutline(built.outline);
  const nLeaves = Math.round(num(p, 'leafCount', 3, 2, 6));
  const pairs = bool(p, 'leafPairs', false);
  // dense foliage (pairs, or more than four leaves a branch) checks every leaf and bud for room before placing it
  const crowd = pairs || nLeaves > 4;
  const leafLen = num(p, 'leafSize', 2.6, 1.4, 4.5);
  const r0 = num(p, 'branchThickness', 1.1, 0.6, 1.8) / 2;
  const nBuds = Math.round(num(p, 'budStones', 1, 0, 4));
  const wrap = (num(p, 'wrap', 15, 0, 70) * Math.PI) / 180;
  const stoneLeaves = str(p, 'leafStyle', LEAF_STYLES, 'metal') === 'stone';
  const hand = str(p, 'hand', ['right', 'left'] as const, 'right') === 'left' ? -1 : 1;
  const profile: TwigProfile =
    str(p, 'twigProfile', TWIG_PROFILES, 'round') === 'flat'
      ? { flat: true, ratio: num(p, 'twigRatio', 2.5, 1.5, 4) }
      : ROUND;
  const boxSeats = stoneLeaves && str(p, 'leafSeat', LEAF_SEATS, 'wire') === 'box';

  const prongs = prongOpts(ctx, { count: 6, style: 'claw', rails: 1, useCorners: true });
  const metal: THREE.BufferGeometry[] = [...prongSet(built, prongs)];
  const stones: THREE.BufferGeometry[] = [];

  const [ax, az] = ctx.bandAxis;
  const px = -az;
  const pz = ax;
  const toStone = (u: number, v: number): [number, number] => [u * ax + v * px, u * az + v * pz];
  const shankTop = (u: number) => -ctx.baseDrop - ringDrop(ctx, u);
  // each branch is built in its own band coordinates: the -u branch uses (u, v) -> (-u, -v); a left hand mirrors v
  let sgn = 1;
  const girdleR = (phi: number): number => {
    let s = 0;
    for (const d of [-0.12, -0.06, 0, 0.06, 0.12]) {
      const [x, z] = toStone(sgn * Math.cos(phi + d), sgn * hand * Math.sin(phi + d));
      const [qx, qz] = radialPoint(o, x, z);
      s += Math.hypot(qx, qz);
    }
    return s / 5;
  };
  /** Is the band-plane point (u, v) over the centre stone (with a margin)? */
  const overStone = (u: number, v: number, margin: number) =>
    Math.hypot(u, v) < girdleR(Math.atan2(v, u)) + margin;

  // ---- a branch's centre line, in band coordinates with stone-frame heights -----------------------------------
  const branch = (): { metal: THREE.BufferGeometry[]; stones: THREE.BufferGeometry[] } => {
    const yArc = Math.min(0.15, built.crownHeight * 0.3) - r0 * 0.9;
    // the twig runs just clear of the girdle (it brushes the prongs, the prongs do the holding)
    const cAt = (phi: number) => girdleR(phi) + r0 + 0.4;
    const arcPt = (phi: number): [number, number] => [cAt(phi) * Math.cos(phi), cAt(phi) * Math.sin(phi)];
    const phiIn = Math.PI / 2 - 0.55;
    const phiEnd = Math.PI / 2 + wrap;
    const [u3, w3] = arcPt(phiIn);
    const t3: [number, number] = [-Math.sin(phiIn), Math.cos(phiIn)];
    // the branch roots far out along the band, its tapered tip emerging from the shank where the shank has fallen up to
    // ~3.2 mm below the seat; the second branch roots a little nearer the stone so the two are not exact copies
    const Rs = shankTopRadius(ctx);
    const leadLen = 0.5;
    const uMax = Math.sqrt(Math.max(0, Rs * Rs - (Rs - 3.2) ** 2));
    const uL = Math.max(u3 + 1.8, Math.min(u3 + 6.5, uMax - leadLen) - (sgn < 0 ? 0.5 : 0));
    const run = uL - u3;
    const v0 = -Math.min(0.6, ctx.shankWidth * 0.25);
    const P0: [number, number] = [uL, v0];
    const P1: [number, number] = [uL - run * 0.45, v0];
    const P2: [number, number] = [u3 - t3[0] * run * 0.45, w3 - t3[1] * run * 0.45];
    const bez = (t: number): [number, number] => {
      const m = 1 - t;
      const b0 = m * m * m;
      const b1 = 3 * m * m * t;
      const b2 = 3 * m * t * t;
      const b3 = t * t * t;
      return [b0 * P0[0] + b1 * P1[0] + b2 * P2[0] + b3 * u3, b0 * P0[1] + b1 * P1[1] + b2 * P2[1] + b3 * w3];
    };

    interface S {
      u: number;
      v: number;
      y: number;
      r: number;
    }
    // the root: thin where it emerges from the shank, swelling to the twig's base thickness
    const lead: S[] = [];
    for (let k = 0; k < 4; k++) {
      const f = k / 4;
      const u = uL + leadLen * (1 - f);
      lead.push({ u, v: v0, y: shankTop(u) - r0 * (0.45 - 0.3 * f), r: r0 * (0.55 + 0.65 * f) });
    }
    // plan: the lead-in curve with a slight S wobble, then the arc round the stone
    const plan: { u: number; v: number; phi: number }[] = [];
    const NB = 24;
    const wob = Math.min(0.22, run * 0.05);
    for (let k = 0; k <= NB; k++) {
      const f = k / NB;
      const [u, v] = bez(f);
      plan.push({ u, v: v + wob * Math.sin(2 * Math.PI * f) * Math.sin(Math.PI * f), phi: -1 });
    }
    const NA = Math.max(6, Math.round(((phiEnd - phiIn) * 180) / Math.PI / 6));
    for (let k = 1; k <= NA; k++) {
      const phi = phiIn + ((phiEnd - phiIn) * k) / NA;
      const [u, v] = arcPt(phi);
      plan.push({ u, v, phi });
    }
    // the twig lies along the shoulder first and lifts off it gently, reaching girdle level beside the stone's middle
    const phiTop = Math.min(phiEnd, Math.PI / 2 + 0.1);
    const pc: number[] = [0];
    for (let i = 1; i < plan.length; i++)
      pc.push(pc[i - 1] + Math.hypot(plan[i].u - plan[i - 1].u, plan[i].v - plan[i - 1].v));
    let iTop = plan.length - 1;
    for (let i = NB + 1; i < plan.length; i++)
      if (plan[i].phi >= phiTop - 1e-9) {
        iTop = i;
        break;
      }
    const sTop = Math.max(1e-6, pc[iTop]);
    const path: S[] = plan.map((q, i) => {
      const x = Math.min(1, pc[i] / sTop);
      const g = climb(x);
      const st = shankTop(q.u) - r0 * 0.15;
      // bark-like taper with faint swellings
      const r =
        r0 *
        ((1.2 - 0.3 * Math.min(1, pc[i] / pc[pc.length - 1]) ** 0.8) * (1 + 0.04 * Math.sin(pc[i] * 3.1)));
      return { u: q.u, v: q.v, y: st + (yArc - st) * g, r };
    });
    // free tail beyond the stone, drifting slightly outward
    const [ue, ve] = arcPt(phiEnd);
    const te: [number, number] = [-Math.sin(phiEnd), Math.cos(phiEnd)];
    const ne: [number, number] = [Math.cos(phiEnd), Math.sin(phiEnd)];
    const tail = 1 + leafLen * 0.45;
    for (let k = 1; k <= 4; k++) {
      const f = k / 4;
      path.push({
        u: ue + te[0] * tail * f + ne[0] * tail * 0.4 * f * f,
        v: ve + te[1] * tail * f + ne[1] * tail * 0.4 * f * f,
        y: yArc + 0.1 * f,
        r: r0 * (0.85 - 0.25 * f),
      });
    }

    // arc length along the visible path
    const cum: number[] = [0];
    for (let i = 1; i < path.length; i++)
      cum.push(cum[i - 1] + Math.hypot(path[i].u - path[i - 1].u, path[i].v - path[i - 1].v));
    const total = cum[cum.length - 1];
    const at = (s: number): { s: S; t: [number, number] } => {
      let i = 1;
      while (i < path.length - 1 && cum[i] < s) i++;
      const a = path[i - 1];
      const b = path[i];
      const f = Math.min(1, Math.max(0, (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1])));
      const tl = Math.hypot(b.u - a.u, b.v - a.v) || 1;
      return {
        s: {
          u: a.u + (b.u - a.u) * f,
          v: a.v + (b.v - a.v) * f,
          y: a.y + (b.y - a.y) * f,
          r: a.r + (b.r - a.r) * f,
        },
        t: [(b.u - a.u) / tl, (b.v - a.v) / tl],
      };
    };

    // ---- features along the branch: side leaves and buds interleaved, then the tip leaf ------------------------
    // with two or more buds, the last one moves onto the side shoot (below), so the total stays `budStones`
    const shootBud = nBuds >= 2;
    const mainBuds = nBuds - (shootBud ? 1 : 0);
    type Feature = {
      kind: 'leaf' | 'bud';
      s: number;
      side: number;
      angle: number;
      scale: number;
      /** an inner partner of a pair: dropped (not flipped) when its side has no room */
      partner?: boolean;
      /** tried instead when a partner is dropped */
      fallback?: Feature;
    };
    const kinds: ('leaf' | 'bud')[] = [];
    let li = nLeaves - 1;
    let bi = mainBuds;
    while (li > 0 || bi > 0) {
      if (li > 0 && (li >= bi || bi === 0)) {
        kinds.push('leaf');
        li--;
      }
      if (bi > 0) {
        kinds.push('bud');
        bi--;
      }
    }
    // buds and leaves vary in size (some buds are tiny); the second branch takes the sizes in another order and its
    // features sit a little further along, so the two branches differ slightly like real twigs
    const alt = sgn < 0 ? 1 : 0;
    const BUD_SCALES = [1, 0.72, 0.88, 0.66];
    const LEAF_SCALES = [1.05, 0.78, 0.95, 0.7];
    // +1: the side of the twig away from the stone at arc length s
    const outSide = (s: number) => {
      const { s: q, t } = at(s);
      return -t[1] * q.u + t[0] * q.v > 0 ? 1 : -1;
    };
    let nb = 0;
    let nl = 0;
    const feats: Feature[] = kinds.map((kind, i) => {
      const s = total * (0.08 + 0.03 * alt + (0.7 * (i + 0.5)) / Math.max(1, kinds.length));
      // foliage on both sides: the first leaf tucks into the crook between twig and stone, then leaves alternate
      // out / in; buds go out / in the other way round
      const k = kind === 'leaf' ? nl++ : nb++;
      const out = outSide(s);
      // (only on the climb: round the stone the inside is the girdle, so everything there grows outward)
      const inward = s < total * 0.5 && (kind === 'leaf' ? k % 2 === 0 : k % 2 === 1);
      const side = inward ? -out : out;
      return {
        kind,
        s,
        side,
        angle: kind === 'leaf' ? (side === out ? 0.8 : 0.5) + 0.1 * ((k + alt) % 2) : 1.2,
        scale:
          kind === 'bud'
            ? BUD_SCALES[(k + alt) % BUD_SCALES.length]
            : LEAF_SCALES[(k + alt) % LEAF_SCALES.length],
      };
    });
    // paired foliage: the side leaves stand in opposite pairs at evenly spaced nodes, both angled outward off the stem
    // towards the tip like a sprig: the outer one full size, the inner one a smaller leaf or (while bud stones last) a
    // bud, and where the inner side has no room (beside the stone) a tiny bud tries instead. The inner partners go in
    // last and only where they clear everything already placed, so the clusters never pile stones on stones
    const extras: Feature[] = [];
    if (pairs) {
      feats.length = 0;
      const nodes = nLeaves - 1;
      let budsLeft = mainBuds;
      for (let i = 0; i < nodes; i++) {
        const s = total * (0.1 + 0.03 * alt + (0.68 * (i + 0.5)) / nodes);
        const out = outSide(s);
        const v = (i + alt) % 2;
        feats.push({ kind: 'leaf', s, side: out, angle: 0.85 + 0.1 * v, scale: LEAF_SCALES[(i + alt) % 4] });
        // buds take every other node from the root, the rest get a partner leaf
        const bud = budsLeft > 0 && (i % 2 === 0 || nodes - i <= budsLeft);
        if (bud) budsLeft--;
        const tiny: Feature = { kind: 'bud', s: s + 0.15, side: -out, angle: 1.3, scale: 0.5, partner: true };
        extras.push(
          bud
            ? {
                kind: 'bud',
                s: s + 0.1,
                side: -out,
                angle: 1.15,
                scale: BUD_SCALES[(i + alt) % 4] * 0.8,
                partner: true,
              }
            : {
                kind: 'leaf',
                s: s + 0.1,
                side: -out,
                angle: 0.95 - 0.1 * v,
                scale: LEAF_SCALES[(i + alt + 1) % 4] * 0.75,
                partner: true,
                // pointing forward it would run into the stone: turn it back towards the band end instead
                fallback: {
                  kind: 'leaf',
                  s: s + 0.1,
                  side: -out,
                  angle: Math.PI - 0.95 + 0.1 * v,
                  scale: LEAF_SCALES[(i + alt + 1) % 4] * 0.75,
                  partner: true,
                  fallback: tiny,
                },
              },
        );
      }
      // bud stones left over (more than every other node) sit just past the last pair, on its outer side
      for (let j = 0; j < budsLeft; j++)
        extras.push({
          kind: 'bud',
          s: total * (0.82 + 0.05 * j),
          side: outSide(total * (0.82 + 0.05 * j)),
          angle: 1.2,
          scale: BUD_SCALES[(j + alt + 1) % 4] * 0.8,
          partner: true,
        });
    }
    // the tip leaf carries on from the twig, turned a little away from the stone
    const tipT = at(total - 0.05);
    const tipOut = -tipT.t[1] * tipT.s.u + tipT.t[0] * tipT.s.v > 0 ? 1 : -1;
    feats.push({ kind: 'leaf', s: total - 0.05, side: tipOut, angle: 0.45, scale: alt ? 0.95 : 1.1 });

    const leafW = leafLen * (stoneLeaves ? 0.48 : 0.42);
    const leafStones = new Map<number, BuiltStone>();
    const leafStoneAt = (scale: number): BuiltStone => {
      const key = Math.round(scale * 100);
      let st = leafStones.get(key);
      if (!st) {
        const l = leafLen * scale;
        const w = leafW * scale;
        st = ctx.stone('marquise', { length: l, width: w, depth: w * 0.62 }, { detail: 'low' });
        leafStones.set(key, st);
      }
      return st;
    };
    const budMm = Math.min(2.4, Math.max(1, ctx.accent.sizeMm));
    const buds = new Map<number, BuiltStone>();
    const budAt = (scale: number): BuiltStone => {
      const key = Math.round(scale * 100);
      let st = buds.get(key);
      if (!st) {
        const d = Math.max(0.8, budMm * scale);
        st = ctx.stone(ctx.accent.cut.id, { length: d, width: d, depth: d * 0.62 }, { detail: 'low' });
        buds.set(key, st);
      }
      return st;
    };
    const wireR = 0.13;

    type Placed = { base: S; dir: [number, number]; reach: number };
    // band-plane footprints (capsules) of every leaf and bud placed on this branch, for the paired extras' room check
    const taken: { a: [number, number]; b: [number, number]; r: number }[] = [];
    const segDist = (p: [number, number], a: [number, number], b: [number, number]) => {
      const du = b[0] - a[0];
      const dv = b[1] - a[1];
      const l2 = du * du + dv * dv;
      const t = l2 < 1e-12 ? 0 : Math.min(1, Math.max(0, ((p[0] - a[0]) * du + (p[1] - a[1]) * dv) / l2));
      return Math.hypot(p[0] - a[0] - du * t, p[1] - a[1] - dv * t);
    };
    const footprint = (q: Placed, from: number, to: number, r: number) => ({
      a: [q.base.u + q.dir[0] * from, q.base.v + q.dir[1] * from] as [number, number],
      b: [q.base.u + q.dir[0] * to, q.base.v + q.dir[1] * to] as [number, number],
      r,
    });
    const roomFor = (f: { a: [number, number]; b: [number, number]; r: number }) => {
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        const p: [number, number] = [f.a[0] + (f.b[0] - f.a[0]) * t, f.a[1] + (f.b[1] - f.a[1]) * t];
        for (const o of taken) if (segDist(p, o.a, o.b) < f.r + o.r + 0.12) return false;
      }
      return true;
    };
    const branchMetal: THREE.BufferGeometry[] = [];
    const branchStones: THREE.BufferGeometry[] = [];
    const tryDirAt = (t: [number, number], side: number, ang: number): [number, number] => {
      const nx = -t[1] * side;
      const nv = t[0] * side;
      return [t[0] * Math.cos(ang) + nx * Math.sin(ang), t[1] * Math.cos(ang) + nv * Math.sin(ang)];
    };
    const clearOf = (s: S, d: [number, number], reach: number, margin = 0.25) => {
      for (const k of [0.35, 0.65, 1])
        if (overStone(s.u + d[0] * reach * k, s.v + d[1] * reach * k, margin)) return false;
      return true;
    };
    const pickDir = (s: S, t: [number, number], side: number, angle: number, reach: number): Placed => {
      // keep the asked side if it (or a flatter angle) stays well clear of the stone, so a leaf can tuck into the crook
      // between twig and stone without hiding under the girdle; else flip
      let d = tryDirAt(t, side, angle);
      if (!clearOf(s, d, reach, 0.45)) d = tryDirAt(t, side, angle * 0.55);
      if (!clearOf(s, d, reach, 0.45)) d = tryDirAt(t, side, angle * 0.3);
      if (!clearOf(s, d, reach, 0.45)) d = tryDirAt(t, -side, angle);
      if (!clearOf(s, d, reach)) d = tryDirAt(t, side, 0.2);
      if (!clearOf(s, d, reach)) d = tryDirAt(t, -side, 0.2);
      return { base: s, dir: d, reach };
    };
    const placeDir = (f: { s: number; side: number; angle: number }, reach: number): Placed => {
      const { s, t } = at(f.s);
      return pickDir(s, t, f.side, f.angle, reach);
    };
    // leaves and buds lean with the shoulder they sprout over, but never sink more than ~1 mm
    const droop = (u0: number, u1: number) => Math.max(-1, (shankTop(u1) - shankTop(u0)) * 0.85);
    const world = (u: number, v: number, y: number) => {
      const [x, z] = toStone(sgn * u, sgn * hand * v);
      return v3(x, y, z);
    };
    const addLeaf = (q: Placed, scale: number) => {
      const len = leafLen * scale;
      const reach = q.reach;
      const ue2 = q.base.u + q.dir[0] * reach;
      const ve2 = q.base.v + q.dir[1] * reach;
      const fall = droop(q.base.u, ue2);
      const base = world(q.base.u, q.base.v, q.base.y);
      // leaves reaching across the finger tip down a little, following the rounded shank like a draped leaf
      const end = world(ue2, ve2, q.base.y + 0.15 + Math.max(-1.2, fall - 0.5 * Math.abs(q.dir[1]) * reach));
      const dir = end.clone().sub(base).normalize();
      if (stoneLeaves) {
        const ls = leafStoneAt(scale);
        const stalk = q.base.r + 0.2;
        const c = base
          .clone()
          .addScaledVector(dir, stalk + len / 2)
          .addScaledVector(v3(0, 1, 0), q.base.r * 0.5 + ls.pavilionDepth * 0.4);
        const st = seatedStone(ls, basisAt(c, dir), base, wireR, boxSeats);
        branchMetal.push(...st.metal);
        branchStones.push(st.stone);
      } else branchMetal.push(metalLeaf(base, dir, reach, leafW * scale));
      taken.push(leafPrint(q, scale));
    };
    /** a leaf's footprint: from the end of its stalk to its tip, half its width across */
    function leafPrint(q: Placed, scale: number) {
      const from = stoneLeaves ? q.base.r + 0.2 : q.base.r;
      return footprint(q, from, Math.max(from, q.reach), (leafW * scale) / 2);
    }
    const addBud = (q: Placed, bud: BuiltStone) => {
      const reach = q.reach;
      const base = world(q.base.u, q.base.v, q.base.y);
      const ue2 = q.base.u + q.dir[0] * reach;
      const ve2 = q.base.v + q.dir[1] * reach;
      const fall = droop(q.base.u, ue2);
      const c = world(ue2, ve2, q.base.y + fall * 0.5 + q.base.r * 0.6 + bud.pavilionDepth * 0.5);
      const dir = v3(c.x - base.x, 0, c.z - base.z);
      if (dir.lengthSq() < 1e-9) dir.set(1, 0, 0);
      const st = seatedStone(bud, basisAt(c, dir.normalize()), base, wireR);
      branchMetal.push(...st.metal);
      branchStones.push(st.stone);
      taken.push(budPrint(q, bud));
    };
    function budPrint(q: Placed, bud: BuiltStone) {
      const rad = Math.max(...cleanOutline(bud.outline).pts.map(([x, z]) => Math.hypot(x, z)));
      return footprint(q, q.reach, q.reach, rad);
    }
    const budReach = (scale: number, r: number) => r + Math.max(0.8, budMm * scale) * 0.5 + 0.15;
    const placeFeature = (f: Feature): void => {
      // does the placed direction stay on the asked side of the twig?
      const keeps = (q: Placed) => Math.sign(at(f.s).t[0] * q.dir[1] - at(f.s).t[1] * q.dir[0]) === f.side;
      if (f.kind === 'leaf') {
        // a leaf asked to tuck in towards the stone shrinks a little to fit the crook before it gives up its side
        let sc = f.scale;
        let q = placeDir(f, leafLen * sc + r0);
        for (const k of [0.82, 0.68])
          if (!keeps(q)) {
            const q2 = placeDir(f, leafLen * f.scale * k + r0);
            if (keeps(q2)) {
              q = q2;
              sc = f.scale * k;
            }
          }
        if (f.partner && !(keeps(q) && clearOf(q.base, q.dir, q.reach, 0.3) && roomFor(leafPrint(q, sc)))) {
          if (f.fallback) placeFeature(f.fallback);
          return;
        }
        // with paired or more than four leaves, a leaf crowding one already placed shrinks to fit, or is left out
        for (const k of [0.8, 0.64])
          if (crowd && !roomFor(leafPrint(q, sc))) {
            const q2 = placeDir(f, leafLen * f.scale * k + r0);
            if (roomFor(leafPrint(q2, f.scale * k))) {
              q = q2;
              sc = f.scale * k;
            }
          }
        if (crowd && !roomFor(leafPrint(q, sc))) return;
        addLeaf(q, sc);
      } else {
        const bud = budAt(f.scale);
        const q = placeDir(f, budReach(f.scale, r0));
        if (f.partner && !(keeps(q) && roomFor(budPrint(q, bud)))) {
          if (f.fallback) placeFeature(f.fallback);
          return;
        }
        if (crowd && !roomFor(budPrint(q, bud))) return;
        addBud(q, bud);
      }
    };
    for (const f of feats) placeFeature(f);
    /**
     * A short sprig forking off the branch at arc length `sS` towards `side` at `angle` from the branch direction,
     * ending in a small leaf; `hug` (0..1) pulls it down onto the shoulder it runs over; `bud` adds a tiny bud stone
     * part way along.
     */
    const sprig = (
      sS: number,
      side: number,
      angle: number,
      len: number,
      hug: number,
      leaf: number,
      bud: boolean,
    ) => {
      const { t } = at(sS);
      const q = placeDir({ s: sS, side, angle }, len);
      const fall = droop(q.base.u, q.base.u + q.dir[0] * len);
      const shoot: TwigPt[] = [];
      const shootS: S[] = [];
      for (let k = 0; k <= 5; k++) {
        const f = k / 5;
        // curls slightly back toward the branch direction as it grows
        const bend = 0.25 * f * f;
        const du = q.dir[0] * (1 - bend) + t[0] * bend * Math.sign(Math.cos(angle));
        const dv = q.dir[1] * (1 - bend) + t[1] * bend * Math.sign(Math.cos(angle));
        const u = q.base.u + du * len * f;
        const r = Math.max(0.12, q.base.r * (0.6 - 0.4 * f));
        const free = q.base.y + (fall * 0.5 + 0.35) * f;
        const onShank = shankTop(u) + r * 0.3;
        shootS.push({
          u,
          v: q.base.v + dv * len * f,
          y: free + (Math.min(free, onShank) - free) * hug * f,
          r,
        });
      }
      const tangent = (i: number): [number, number] => {
        const a = shootS[Math.max(0, i - 1)];
        const b = shootS[Math.min(shootS.length - 1, i + 1)];
        const l = Math.hypot(b.u - a.u, b.v - a.v) || 1;
        return [(b.u - a.u) / l, (b.v - a.v) / l];
      };
      const tipS = { ...shootS[5], r: Math.max(0.2, shootS[5].r) };
      const tipLeaf = pickDir(tipS, tangent(5), side, 0.35, leafLen * leaf + 0.2);
      const shootPrints = shootS.slice(2).map((b, k) => ({
        a: [shootS[k + 1].u, shootS[k + 1].v] as [number, number],
        b: [b.u, b.v] as [number, number],
        r: b.r,
      }));
      // with crowded foliage the sprig only grows where it clears the leaves and buds already on the branch
      if (crowd && !(shootPrints.every(roomFor) && roomFor(leafPrint(tipLeaf, leaf)))) return;
      for (const sp of shootS) shoot.push({ p: world(sp.u, sp.v, sp.y), r: sp.r });
      branchMetal.push(twig(shoot, 8, profile));
      taken.push(...shootPrints);
      addLeaf(tipLeaf, leaf);
      if (bud) {
        const midS = { ...shootS[3], r: Math.max(0.2, shootS[3].r) };
        addBud(pickDir(midS, tangent(3), -side, 1.3, budReach(0.62, midS.r)), budAt(0.62));
      }
    };
    // a side shoot off the climb, away from the stone (paired foliage fills the climb itself instead)
    if (!pairs) {
      const sS = total * 0.3;
      const { s, t } = at(sS);
      const out = -t[1] * s.u + t[0] * s.v > 0 ? 1 : -1;
      sprig(sS, out, 0.75, 1.3 + leafLen * 0.35, 0, 0.8, false);
    }
    // a sprig near the root turning back down the shoulder towards the band end, carrying a bud when there are two
    // or more (the foliage spreads along the band like the twig it grew from)
    {
      const sS = Math.min(total * 0.12, 1.6);
      const { s, t } = at(sS);
      const out = -t[1] * s.u + t[0] * s.v > 0 ? 1 : -1;
      sprig(sS, out, Math.PI - 1.25, 0.9 + leafLen * 0.25, 1, 0.7, shootBud);
    }
    for (const f of extras) placeFeature(f);
    const pts: TwigPt[] = [...lead, ...path].map((q) => ({ p: world(q.u, q.v, q.y), r: q.r }));
    branchMetal.push(twig(pts, 10, profile));
    return { metal: branchMetal, stones: branchStones };
  };
  for (const s of [1, -1]) {
    sgn = s;
    const b = branch();
    metal.push(...b.metal);
    stones.push(...b.stones);
  }

  const parts: Part[] = [metalPart(metal, 'leaf-vine bypass head')];
  if (stones.length) parts.push(accentPart(stones, stoneLeaves ? 'leaf and bud stones' : 'bud stones'));
  return parts;
}

registerHeadBuilder('leaf-vine-bypass', leafVineBypass);
