/**
 * Leaf-vine bypass head: the centre stone sits in claw prongs while two twig-like branches rise out of the shank from
 * either end of the band, sweep past opposite sides of the stone like a bypass and run on beyond it. Free-standing
 * leaves (flat metal blades with a raised midrib, or marquise stones in a thin leaf seat) sprout off each branch, with
 * optional small round "bud" stones on short stalks. The branches are point symmetric: the one rising from the +band
 * end wraps the +across side of the stone, the other the opposite side.
 */
import * as THREE from 'three';
import { registerHeadBuilder } from '../builders';
import type { BuiltStone, HeadCtx, Part } from '../types';
import { loftRows, toFlat } from '../helpers';
import {
  accentPart,
  ball,
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

/** Tapered round twig through the samples (closed ends). */
function twig(pts: TwigPt[], radial = 10): THREE.BufferGeometry {
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
 * point nearest it. Returns the metal and the placed stone.
 */
function seatedStone(
  stone: BuiltStone,
  m: THREE.Matrix4,
  from: THREE.Vector3,
  wireR: number,
): { metal: THREE.BufferGeometry[]; stone: THREE.BufferGeometry } {
  const o = cleanOutline(stone.outline);
  const rimY = -Math.min(0.12, stone.pavilionDepth * 0.3);
  const rim = o.pts.map(([x, z]) => {
    const l = Math.hypot(x, z) || 1;
    return v3(x + (x / l) * 0.04, rimY, z + (z / l) * 0.04).applyMatrix4(m);
  });
  const metal: THREE.BufferGeometry[] = [loop(rim, wireR, Math.max(16, rim.length), 6)];
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

/**
 * Params: `leafCount` (leaves per branch, the last one at its tip), `leafSize` (leaf length), `branchThickness`,
 * `budStones` (small round stones on stalks per branch), `wrap` (degrees each branch runs round the stone past its
 * middle), `leafStyle` ('metal' blades or 'stone' marquise leaves), `hand` ('right': the +band branch wraps the +across
 * side; 'left' mirrors the swirl), plus the centre prongs (`prongCount`, `prongStyle`).
 */
function leafVineBypass(ctx: HeadCtx): Part[] {
  const p = ctx.params;
  const built = ctx.center.built;
  const o = cleanOutline(built.outline);
  const nLeaves = Math.round(num(p, 'leafCount', 3, 2, 4));
  const leafLen = num(p, 'leafSize', 2.6, 1.4, 4.5);
  const r0 = num(p, 'branchThickness', 1.1, 0.6, 1.8) / 2;
  const nBuds = Math.round(num(p, 'budStones', 1, 0, 4));
  const wrap = (num(p, 'wrap', 15, 0, 70) * Math.PI) / 180;
  const stoneLeaves = str(p, 'leafStyle', LEAF_STYLES, 'metal') === 'stone';
  const hand = str(p, 'hand', ['right', 'left'] as const, 'right') === 'left' ? -1 : 1;

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
    // the branch meets the shank before the shank has fallen ~2.6 mm below the seat
    const Rs = shankTopRadius(ctx);
    const uMax = Math.sqrt(Math.max(0, Rs * Rs - (Rs - 2.6) ** 2));
    const uL = Math.max(u3 + 1.8, Math.min(u3 + 5, uMax - 0.4));
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
    const rRoot = r0 * 1.2;
    const lead: S[] = [];
    for (let k = 0; k < 4; k++) {
      const f = k / 4;
      const u = uL + 0.6 * (1 - f);
      lead.push({ u, v: v0, y: shankTop(u) - r0 + r0 * 0.85 * f, r: rRoot });
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
    type Feature = { kind: 'leaf' | 'bud'; s: number; side: 1 | -1; angle: number };
    const kinds: ('leaf' | 'bud')[] = [];
    let li = nLeaves - 1;
    let bi = nBuds;
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
    const feats: Feature[] = kinds.map((kind, i) => ({
      kind,
      s: total * (0.1 + (0.72 * (i + 0.5)) / Math.max(1, kinds.length)),
      side: i % 2 === 0 ? 1 : -1,
      angle: kind === 'leaf' ? 0.95 : 1.2,
    }));
    // the tip leaf carries on from the twig, turned a little away from the stone
    const tipT = at(total - 0.05);
    const tipOut = -tipT.t[1] * tipT.s.u + tipT.t[0] * tipT.s.v > 0 ? 1 : -1;
    feats.push({ kind: 'leaf', s: total - 0.05, side: tipOut, angle: 0.45 });

    const leafW = leafLen * (stoneLeaves ? 0.48 : 0.42);
    const leafStone = stoneLeaves
      ? ctx.stone('marquise', { length: leafLen, width: leafW, depth: leafW * 0.62 }, { detail: 'low' })
      : null;
    const budMm = Math.min(2.4, Math.max(1, ctx.accent.sizeMm));
    const bud = ctx.stone(
      ctx.accent.cut.id,
      { length: budMm, width: budMm, depth: budMm * 0.62 },
      { detail: 'low' },
    );
    const wireR = 0.13;

    type Placed = { base: S; dir: [number, number]; reach: number };
    const branchMetal: THREE.BufferGeometry[] = [];
    const branchStones: THREE.BufferGeometry[] = [];
    const placeDir = (f: Feature, reach: number): Placed => {
      const { s, t } = at(f.s);
      const tryDir = (side: number, ang: number): [number, number] => {
        const nx = -t[1] * side;
        const nv = t[0] * side;
        return [t[0] * Math.cos(ang) + nx * Math.sin(ang), t[1] * Math.cos(ang) + nv * Math.sin(ang)];
      };
      const clear = (d: [number, number]) => {
        for (const k of [0.35, 0.65, 1])
          if (overStone(s.u + d[0] * reach * k, s.v + d[1] * reach * k, 0.25)) return false;
        return true;
      };
      let d = tryDir(f.side, f.angle);
      if (!clear(d)) d = tryDir(-f.side, f.angle);
      if (!clear(d)) d = tryDir(f.side, 0.2);
      if (!clear(d)) d = tryDir(-f.side, 0.2);
      return { base: s, dir: d, reach };
    };
    // leaves and buds lean with the shoulder they sprout over, but never sink more than ~1 mm
    const droop = (u0: number, u1: number) => Math.max(-1, (shankTop(u1) - shankTop(u0)) * 0.85);
    const world = (u: number, v: number, y: number) => {
      const [x, z] = toStone(sgn * u, sgn * hand * v);
      return v3(x, y, z);
    };
    for (const f of feats) {
      if (f.kind === 'leaf') {
        const reach = leafLen + r0;
        const q = placeDir(f, reach);
        const ue2 = q.base.u + q.dir[0] * reach;
        const ve2 = q.base.v + q.dir[1] * reach;
        const fall = droop(q.base.u, ue2);
        const base = world(q.base.u, q.base.v, q.base.y);
        const end = world(ue2, ve2, q.base.y + fall + 0.15);
        const dir = end.clone().sub(base).normalize();
        if (leafStone) {
          const stalk = q.base.r + 0.2;
          const c = base
            .clone()
            .addScaledVector(dir, stalk + leafLen / 2)
            .addScaledVector(v3(0, 1, 0), q.base.r * 0.5 + leafStone.pavilionDepth * 0.4);
          const st = seatedStone(leafStone, basisAt(c, dir), base, wireR);
          branchMetal.push(...st.metal);
          branchStones.push(st.stone);
        } else branchMetal.push(metalLeaf(base, dir, reach, leafW));
      } else {
        const reach = r0 + budMm * 0.5 + 0.15;
        const q = placeDir(f, reach);
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
      }
    }
    // a short bare shoot forking off the climb, on the side away from the stone
    {
      const sS = total * 0.3;
      const { s, t } = at(sS);
      const out = -t[1] * s.u + t[0] * s.v > 0 ? 1 : -1;
      const len = 1.3 + leafLen * 0.35;
      const q = placeDir({ kind: 'leaf', s: sS, side: out, angle: 0.75 }, len);
      const fall = droop(q.base.u, q.base.u + q.dir[0] * len);
      const shoot: TwigPt[] = [];
      for (let k = 0; k <= 5; k++) {
        const f = k / 5;
        // curls slightly back toward the branch direction as it grows
        const bend = 0.25 * f * f;
        const du = q.dir[0] * (1 - bend) + t[0] * bend;
        const dv = q.dir[1] * (1 - bend) + t[1] * bend;
        shoot.push({
          p: world(q.base.u + du * len * f, q.base.v + dv * len * f, q.base.y + (fall * 0.5 + 0.35) * f),
          r: Math.max(0.12, q.base.r * (0.6 - 0.4 * f)),
        });
      }
      branchMetal.push(twig(shoot, 8));
    }
    const pts: TwigPt[] = [...lead, ...path].map((q) => ({ p: world(q.u, q.v, q.y), r: q.r }));
    branchMetal.push(twig(pts));
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
