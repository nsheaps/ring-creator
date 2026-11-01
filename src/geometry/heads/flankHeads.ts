/**
 * Flank and blade heads: a centre stone with a cluster of small tilted stones on each side (cluster-flank), and the
 * tension-bypass head whose two swept blades grip the stone from either end of the band, offset across the finger.
 */
import * as THREE from 'three';
import { headBuilders, registerHeadBuilder } from '../builders';
import type { HeadCtx, Part } from '../types';
import {
  PRONG_STYLES,
  accentPart,
  autoWireMm,
  cleanOutline,
  placeMatrix,
  prongSet,
  transformAll,
  wire,
  type CleanOutline,
  metalPart,
  num,
  str,
  support,
  type ProngStyle,
} from './common';
import {
  basket,
  centreAcross,
  centreBasket,
  matchStone,
  seatBars,
  seatBeside,
  sideStone,
  type SideStone,
} from './multiStoneHeads';

const ARRANGEMENTS = ['fan', 'column', 'chevron', 'row'] as const;

/**
 * Cluster-flank: a centre stone in its prongs with `flankCount` small stones on each side. They are tilted to follow
 * the shoulders and each sits in its own small prongs on the shank. The arrangement is a column (stacked across the
 * finger), a chevron (a V opening away from the centre) or a row (graduated along the band).
 */
function clusterFlank(ctx: HeadCtx): Part[] {
  if (str(ctx.params, 'arrangement', ARRANGEMENTS, 'fan') === 'fan') return fanFlank(ctx);
  const o = cleanOutline(ctx.center.built.outline);
  const p = ctx.params;
  const [ax, az] = ctx.bandAxis;
  const n = Math.round(num(p, 'flankCount', 3, 1, 5));
  const ratio = num(p, 'flankRatio', 0.3, 0.12, 0.8);
  const shrink = num(p, 'flankTaper', 0.85, 0.5, 1);
  const gap = num(p, 'flankGap', 0.2, 0, 1.5);
  const tiltK = num(p, 'flankTilt', 1, 0.4, 1.6);
  const arrangement = str(p, 'arrangement', ARRANGEMENTS, 'column') as 'column' | 'chevron' | 'row';
  const match = str(p, 'flankCut', ['accent', 'match'] as const, 'accent') === 'match';
  const style = str(p, 'prongStyle', PRONG_STYLES, 'round') as ProngStyle;
  const centre = centreBasket(ctx, style);
  const metal: THREE.BufferGeometry[] = [...centre.geos];
  const stones: THREE.BufferGeometry[] = [];
  const across = centreAcross(ctx);
  const clear = Math.min(0.85, Math.max(0.65, ctx.baseDrop - ctx.center.built.pavilionDepth) * 0.7);
  const r = centre.wireMm * 0.35;
  const mk = (size: number, sign: 1 | -1): SideStone =>
    match ? matchStone(ctx, size, false, 'low') : sideStone(ctx, ctx.accent.cut, size, sign, 'low');
  const prongsPer = Math.round(num(p, 'sideProngs', 3, 3, 6));
  for (const sign of [-1, 1] as const) {
    const base = support(o, sign * ax, sign * az) + gap;
    let size = across * ratio;
    let edge = base;
    let lastU = 0;
    for (let k = 0; k < n; k++) {
      let off = 0;
      let e = base;
      if (arrangement === 'column') off = (k - (n - 1) / 2) * (size * 1.02 + gap);
      else if (arrangement === 'chevron') {
        off = (k - (n - 1) / 2) * (size * 1.02 + gap);
        e = base + Math.abs(off) * 0.9;
      } else e = edge;
      const s = mk(size, sign);
      const q = seatBeside(ctx, s, sign, e, off, clear, tiltK);
      stones.push(s.built.geometry.clone().applyMatrix4(q.m));
      metal.push(
        ...basket(ctx, s, q, {
          count: prongsPer,
          style,
          wireMm: num(p, 'prongWidth', 0, 0, 1.6) * 0.6 || autoWireMm(s.built) * 0.85,
          rails: [0.4],
          baseScale: 0.45,
        }),
      );
      metal.push(...seatBars(ctx, lastU, q.u, r, 0, off));
      if (arrangement === 'row') {
        edge = (sign > 0 ? q.uMax : -q.uMin) + gap;
        size *= shrink;
      }
      lastU = arrangement === 'row' ? q.u : Math.abs(q.u) > Math.abs(lastU) ? q.u : lastU;
    }
  }
  return [metalPart(metal, 'cluster-flank head'), accentPart(stones, 'flank stones')];
}

/** Distance from the origin along unit (du, dv) (band axis, across axis) to the outline's boundary. */
function rayHit(o: CleanOutline, ctx: HeadCtx, du: number, dv: number): number {
  const [ax, az] = ctx.bandAxis;
  const dx = ax * du - az * dv;
  const dz = az * du + ax * dv;
  let best = 0;
  for (let i = 0; i < o.pts.length; i++) {
    const [x0, z0] = o.pts[i];
    const [x1, z1] = o.pts[(i + 1) % o.pts.length];
    const ex = x1 - x0;
    const ez = z1 - z0;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = (x0 * ez - z0 * ex) / den;
    const w = (x0 * dz - z0 * dx) / den;
    if (t > 0 && w >= 0 && w <= 1) best = Math.max(best, t);
  }
  return best;
}

/**
 * Fan flank: on each side of the centre a fan of marquises (pointing away from the stone, the middle one along the
 * band) with small rounds in the wedges between them and beside the end prongs. The stones lie in (almost) the centre
 * stone's own plane, hard against its girdle, so the whole head reads as one low, wide cluster crown. A shared gallery
 * of rods carries them down to the shank.
 */
function fanFlank(ctx: HeadCtx): Part[] {
  const o = cleanOutline(ctx.center.built.outline);
  const p = ctx.params;
  const [ax, az] = ctx.bandAxis;
  const px = -az;
  const pz = ax;
  const n = Math.round(num(p, 'flankCount', 3, 1, 5));
  const ratio = num(p, 'flankRatio', 0.3, 0.12, 0.8);
  const gap = num(p, 'flankGap', 0.2, 0, 1.5);
  const tiltK = num(p, 'flankTilt', 1, 0.4, 1.6);
  const spread = (num(p, 'fanSpread', 80, 30, 120) * Math.PI) / 180;
  const style = str(p, 'prongStyle', PRONG_STYLES, 'round') as ProngStyle;
  const cutKey = str(p, 'fanCut', ['marquise', 'pear', 'oval', 'accent'] as const, 'marquise');
  const cutId = cutKey === 'accent' ? ctx.accent.cut.id : cutKey;
  const centre = centreBasket(ctx, style);
  const metal: THREE.BufferGeometry[] = [...centre.geos];
  const stones: THREE.BufferGeometry[] = [];
  // extent of the centre stone across the band's perpendicular (the fan's span)
  const span = support(o, px, pz) + support(o, -px, -pz);
  const ml = Math.max(1.6, span * ratio * 1.7);
  const mw = ml * 0.48;
  const rd = Math.max(1, ml * 0.24);
  const tilt = 0.22 * tiltK;
  const step = n > 1 ? Math.min((40 * Math.PI) / 180, spread / (n - 1)) : 0;
  const wireMm = num(p, 'prongWidth', 0, 0, 1.6) * 0.6 || 0.5;
  const rr = Math.max(0.25, wireMm * 0.55);
  // every stone's table sits just under the centre's girdle plane
  const yTab = -0.15;
  const place = (
    sign: 1 | -1,
    theta: number,
    len: number,
    wid: number,
    cut: string,
    inset: number,
    rod = true,
  ): { u: number; v: number; c: THREE.Vector3 } => {
    const du = sign * Math.cos(theta);
    const dv = Math.sin(theta);
    const hit = rayHit(o, ctx, du, dv);
    const r = hit + gap + inset + len / 2;
    const cu = du * r;
    const cv = dv * r;
    const dx = ax * du - az * dv;
    const dz = az * du + ax * dv;
    const built = ctx.stone(cut, { length: len, width: wid, depth: wid * 0.62 }, { detail: 'low' });
    const cx = ax * cu - az * cv;
    const cz = az * cu + ax * cv;
    const m = placeMatrix(cx, yTab - Math.abs(cu) * Math.tan(tilt) * 0.0, cz, dx, dz, tilt, dx, dz);
    stones.push(built.geometry.clone().applyMatrix4(m));
    const seat = -(built.pavilionDepth + 0.35);
    const baseY = Math.min(-0.2, seat);
    metal.push(
      ...transformAll(
        prongSet(built, {
          count: rod ? 4 : 3,
          style: 'round',
          wireMm: rod ? Math.max(0.4, Math.min(0.6, wireMm)) : 0.35,
          baseY,
          baseScale: 0.4,
          useCorners: true,
          rails: [],
        }),
        m,
      ),
    );
    // a rod from the stone's underside to under the centre stone's seat, joining the shared gallery
    const foot = new THREE.Vector3(0, baseY, 0).applyMatrix4(m);
    const root = new THREE.Vector3(
      ax * du * 0.5 * hit - az * dv * 0.5 * hit,
      -ctx.baseDrop + 0.15,
      az * du * 0.5 * hit + ax * dv * 0.5 * hit,
    );
    if (rod)
      metal.push(
        ...wire(
          [
            foot,
            foot
              .clone()
              .lerp(root, 0.5)
              .setY(Math.min(foot.y, root.y) * 0.6 + Math.max(foot.y, root.y) * 0.4),
            root,
          ],
          rr,
          12,
          6,
        ),
      );
    return { u: cu, v: cv, c: foot };
  };
  for (const sign of [-1, 1] as const) {
    const angles: number[] = [];
    for (let i = 0; i < n; i++) angles.push((i - (n - 1) / 2) * step);
    for (const th of angles) {
      const k = 1 - 0.18 * (Math.abs(th) / Math.max(0.01, spread / 2));
      place(sign, th, ml * k, mw * k, cutId, 0);
    }
    // rounds in the wedges between marquises, and at both ends beside the end prongs
    const mids: number[] = [];
    for (let i = 0; i + 1 < angles.length; i++) mids.push((angles[i] + angles[i + 1]) / 2);
    const endTh = Math.min(
      (78 * Math.PI) / 180,
      (angles.length ? angles[angles.length - 1] : 0) + step * 0.9 + 0.55,
    );
    mids.push(-endTh, endTh);
    for (const th of mids) {
      const end = Math.abs(th) >= endTh - 1e-6;
      place(
        sign,
        th,
        rd * (end ? 1.05 : 1),
        rd * (end ? 1.05 : 1),
        'round-brilliant',
        end ? 0.05 : ml * 0.2,
        false,
      );
    }
  }
  return [metalPart(metal, 'cluster-flank head'), accentPart(stones, 'flank stones')];
}

/** Smooth 0..1 ramp. */
const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/**
 * Tension-bypass: the tension jaws, but each blade is swept across the finger. At the stone the two blades sit on
 * opposite sides of the centre line (so they pass each other like a bypass shank) and ease back to the band's centre
 * line towards the shank, which they join.
 */
function tensionBypass(ctx: HeadCtx): Part[] {
  const tension = headBuilders.get('tension');
  if (!tension) throw new Error('tension builder missing');
  const p = ctx.params;
  const blade = num(p, 'bladeWidth', 2.6, 1.2, 5);
  const sweep = num(p, 'sweepOffset', 1.0, 0, 2.5);
  const run = num(p, 'sweepRun', 4.5, 2, 9);
  const parts = tension({
    ...ctx,
    params: {
      ...p,
      jawWidth: blade,
      jawThickness: num(p, 'jawThickness', 2.4, 1, 4),
      bite: num(p, 'bite', 0.25, 0.05, 0.6),
    },
  });
  const o = cleanOutline(ctx.center.built.outline);
  const [ax, az] = ctx.bandAxis;
  const px = -az;
  const pz = ax;
  const a0 = Math.min(support(o, ax, az), support(o, -ax, -az));
  for (const part of parts) {
    const pos = part.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const u = x * ax + z * az;
      const side = u >= 0 ? 1 : -1;
      const off = side * sweep * (1 - smooth((Math.abs(u) - a0) / run));
      pos.setX(i, x + px * off);
      pos.setZ(i, z + pz * off);
    }
    pos.needsUpdate = true;
    part.geometry.computeVertexNormals();
    part.label = 'tension-bypass blades';
  }
  return parts;
}

registerHeadBuilder('cluster-flank', clusterFlank);
registerHeadBuilder('tension-bypass', tensionBypass);
