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

const ARRANGEMENTS = ['column', 'chevron', 'row'] as const;

/**
 * Cluster-flank: a centre stone in its prongs with `flankCount` small stones on each side. They are tilted to follow
 * the shoulders and each sits in its own small prongs on the shank. The arrangement is a column (stacked across the
 * finger), a chevron (a V opening away from the centre) or a row (graduated along the band).
 */
function clusterFlank(ctx: HeadCtx): Part[] {
  const o = cleanOutline(ctx.center.built.outline);
  const p = ctx.params;
  const [ax, az] = ctx.bandAxis;
  const n = Math.round(num(p, 'flankCount', 3, 1, 5));
  const ratio = num(p, 'flankRatio', 0.3, 0.12, 0.8);
  const shrink = num(p, 'flankTaper', 0.85, 0.5, 1);
  const gap = num(p, 'flankGap', 0.2, 0, 1.5);
  const tiltK = num(p, 'flankTilt', 1, 0.4, 1.6);
  const arrangement = str(p, 'arrangement', ARRANGEMENTS, 'column');
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
