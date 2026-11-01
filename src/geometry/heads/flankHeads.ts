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
    match ? matchStone(ctx, size, false, 'full') : sideStone(ctx, ctx.accent.cut, size, sign, 'full');
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

/**
 * Distance along unit (du, dv) (band axis, across axis) from the point (u0, v0) to the outline's boundary (0 when the
 * ray misses it).
 */
function rayHit(o: CleanOutline, ctx: HeadCtx, du: number, dv: number, u0 = 0, v0 = 0): number {
  const [ax, az] = ctx.bandAxis;
  const dx = ax * du - az * dv;
  const dz = az * du + ax * dv;
  const sx = ax * u0 - az * v0;
  const sz = az * u0 + ax * v0;
  let best = 0;
  for (let i = 0; i < o.pts.length; i++) {
    const x0 = o.pts[i][0] - sx;
    const z0 = o.pts[i][1] - sz;
    const x1 = o.pts[(i + 1) % o.pts.length][0] - sx;
    const z1 = o.pts[(i + 1) % o.pts.length][1] - sz;
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
 * Fan flank: on each side of the centre a compact fan of marquises (the middle one along the band, the others angled
 * towards the centre's ends), each with its inner tip against the centre stone's girdle, plus small rounds in the
 * wedges between them and tucked against the centre beyond the end marquises. The fan starts from a short column beside
 * the stone rather than from its middle, so it hugs the centre like butterfly wings instead of a sunburst. The stones'
 * girdles sit level with the centre's girdle, below its crown, so the centre stays on top; a shared gallery of rods
 * carries them down to the shank.
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
  const cutKey = str(p, 'fanCut', ['marquise', 'pear', 'oval', 'round', 'accent'] as const, 'marquise');
  const cutId = cutKey === 'accent' ? ctx.accent.cut.id : cutKey === 'round' ? 'round-brilliant' : cutKey;
  const round = cutKey === 'round';
  const centre = centreBasket(ctx, style);
  const metal: THREE.BufferGeometry[] = [...centre.geos];
  const stones: THREE.BufferGeometry[] = [];
  // half the centre stone's extent across the band (the fan's column beside it stays inside this)
  const half = Math.min(support(o, px, pz), support(o, -px, -pz));
  const ml = Math.max(1.4, 2 * half * ratio * 1.45);
  // real side-stone proportions: marquise 2:1, pear 1.6:1, oval 1.4:1 (length : width)
  const accentAspect = Math.max(1, ctx.accent.cut.defaultAspect || 1);
  const aspect = round ? 1 : (FAN_ASPECT[cutKey] ?? accentAspect);
  const mw = ml / aspect;
  const rd = Math.max(0.9, ml * (round ? 0.62 : 0.26));
  /** Footprints already placed on this side (centre u, v; unit direction; half length, half width). */
  let placed: { u: number; v: number; du: number; dv: number; a: number; b: number }[] = [];
  const tilt = 0.12 * tiltK;
  const step = n > 1 ? Math.min((38 * Math.PI) / 180, spread / (n - 1)) : 0;
  // the marquises' inner tips stand in a short column beside the centre, inside its middle part
  const pitch = n > 1 ? Math.min((1.5 * half) / (n - 1), Math.max(mw * 0.95, half / (n - 1))) : 0;
  const wireMm = num(p, 'prongWidth', 0, 0, 1.6) * 0.6 || 0.5;
  const rr = Math.max(0.25, wireMm * 0.55);
  /** A stone whose inner end is at (u0 + sign * inset, v0) and whose length points along angle theta, outwards. */
  const place = (
    sign: 1 | -1,
    v0: number,
    theta: number,
    len: number,
    wid: number,
    cut: string,
    inset: number,
    rod = true,
  ): void => {
    const du = sign * Math.cos(theta);
    const dv = Math.sin(theta);
    const edge = rayHit(o, ctx, sign, 0, 0, v0);
    // push the stone out until its girdle (an ellipse len x wid) clears the centre's girdle where the outline curves
    const clears = (u: number, v: number): boolean => {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const lu = (Math.cos(a) * len) / 2;
        const lv = (Math.sin(a) * wid) / 2;
        const qu = u + du * lu - dv * lv;
        const qv = v + dv * lu + du * lv;
        const r = Math.hypot(qu, qv);
        if (r > 1e-6 && r < rayHit(o, ctx, qu / r, qv / r) + gap * 0.5) return false;
      }
      // and never overlaps a neighbour already placed (ellipses inflated by half the gap each)
      const me = { u, v, du, dv, a: len / 2, b: wid / 2 };
      return placed.every((q) => !ellipsesOverlap(me, q, gap * 0.5 + 0.04));
    };
    let push = inset;
    let cu = 0;
    let cv = 0;
    let ok = false;
    for (let k = 0; k < 80 && !ok; k++, push += 0.05) {
      cu = sign * (edge + gap + push) + du * (len / 2);
      cv = v0 + dv * (len / 2);
      ok = clears(cu, cv);
    }
    // no room within 4 mm (a filler round squeezed out by big neighbours): leave it out rather than overlap
    if (!ok) return;
    placed.push({ u: cu, v: cv, du, dv, a: len / 2, b: wid / 2 });
    const dx = ax * du - az * dv;
    const dz = az * du + ax * dv;
    // full detail: a fan has a dozen or so stones, each large enough that its star and bezel facets show; depth is
    // 60% of the width like a well-cut brilliant
    const built = ctx.stone(cut, { length: len, width: wid, depth: wid * 0.6 }, { detail: 'full' });
    const cx = ax * cu - az * cv;
    const cz = az * cu + ax * cv;
    // tilted outwards about its middle; dropped so the inner end's girdle meets the centre's girdle plane
    const y = -(len / 2) * Math.sin(tilt) - 0.05;
    const m = placeMatrix(cx, y, cz, dx, dz, tilt, dx, dz);
    stones.push(built.geometry.clone().applyMatrix4(m));
    const baseY = Math.min(-0.2, -(built.pavilionDepth + 0.35));
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
    if (!rod) return;
    // a rod from the stone's underside to under the centre stone's seat, joining the shared gallery
    const foot = new THREE.Vector3(0, baseY, 0).applyMatrix4(m);
    const ru = sign * edge * 0.5;
    const rv = v0 * 0.5;
    const root = new THREE.Vector3(ax * ru - az * rv, -ctx.baseDrop + 0.15, az * ru + ax * rv);
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
  };
  for (const sign of [-1, 1] as const) {
    placed = [];
    if (round && n === 1) {
      // a tidy trio of equal rounds: two side by side against the centre, the third nested outside between them
      const rt = ml * 0.8;
      const vt = rt / 2 + gap * 0.5 + 0.06;
      for (const s of [-1, 1]) place(sign, s * vt, 0, rt, rt, cutId, 0);
      place(sign, 0, 0, rt, rt, cutId, 0);
      continue;
    }
    const rows: { v: number; th: number; len: number; wid: number }[] = [];
    for (let i = 0; i < n; i++) {
      const t = i - (n - 1) / 2;
      const k = 1 - 0.15 * (Math.abs(t) / Math.max(1, (n - 1) / 2));
      rows.push({ v: t * pitch, th: t * step, len: ml * k, wid: mw * k });
    }
    // middle stone first, then outwards, so the outer ones step aside for it rather than the other way round
    const order = rows.map((_, i) => i).sort((x, y) => Math.abs(x - (n - 1) / 2) - Math.abs(y - (n - 1) / 2));
    for (const i of order) place(sign, rows[i].v, rows[i].th, rows[i].len, rows[i].wid, cutId, 0);
    // rounds in the wedges between neighbouring marquises, part way out
    for (let i = 0; i + 1 < rows.length; i++) {
      const a = rows[i];
      const b = rows[i + 1];
      const th = (a.th + b.th) / 2;
      const out = Math.min(a.len, b.len) * 0.55;
      place(
        sign,
        (a.v + b.v) / 2 + Math.sin(th) * out,
        th,
        rd,
        rd,
        'round-brilliant',
        Math.cos(th) * out - rd / 2,
        false,
      );
    }
    // and one tucked against the centre beyond each end marquise
    const last = rows[rows.length - 1];
    const ve = Math.min(half * 0.85, Math.abs(last.v) + last.wid / 2 + rd * 0.6);
    for (const s of [-1, 1]) place(sign, s * ve, s * step * 0.5, rd, rd, 'round-brilliant', 0, false);
  }
  return [metalPart(metal, 'cluster-flank head'), accentPart(stones, 'flank stones')];
}

/** Length : width of the fan's elongated stones (GIA-typical side-stone ratios). */
const FAN_ASPECT: Record<string, number> = { marquise: 2, pear: 1.6, oval: 1.4 };

interface Footprint {
  u: number;
  v: number;
  du: number;
  dv: number;
  a: number;
  b: number;
}

/** Whether two girdle ellipses (each grown by `pad`) overlap, by sampling each one's rim against the other. */
export function ellipsesOverlap(p: Footprint, q: Footprint, pad: number): boolean {
  const inside = (e: Footprint, u: number, v: number): boolean => {
    const x = (u - e.u) * e.du + (v - e.v) * e.dv;
    const y = -(u - e.u) * e.dv + (v - e.v) * e.du;
    return (x / (e.a + pad)) ** 2 + (y / (e.b + pad)) ** 2 < 1;
  };
  const rimHits = (e: Footprint, f: Footprint): boolean => {
    for (let i = 0; i < 32; i++) {
      const t = (i / 32) * Math.PI * 2;
      const lx = Math.cos(t) * (e.a + pad);
      const ly = Math.sin(t) * (e.b + pad);
      if (inside(f, e.u + e.du * lx - e.dv * ly, e.v + e.dv * lx + e.du * ly)) return true;
    }
    return inside(f, e.u, e.v);
  };
  return rimHits(p, q) || rimHits(q, p);
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
