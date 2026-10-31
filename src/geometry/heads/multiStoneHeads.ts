/** Multi-stone heads: three-stone, five-stone, toi-et-moi and bypass. Extra stones sit along ctx.bandAxis. */
import * as THREE from 'three';
import { registerHeadBuilder } from '../builders';
import type { BuiltStone, HeadCtx, Part } from '../types';
import type { StoneDims } from '@/models/stoneMath';
import {
  PRONG_STYLES,
  accentDims,
  autoWireMm,
  accentPart,
  bool,
  cleanOutline,
  metalPart,
  num,
  placeMatrix,
  prongSet,
  ringDrop,
  str,
  support,
  transformAll,
  v3,
  wire,
  type CleanOutline,
} from './common';
import { prongOpts } from './prongHeads';

/** Support of a placed stone's outline along a world (x,z) direction. */
function supportWorld(o: CleanOutline, m: THREE.Matrix4, dx: number, dz: number): number {
  const inv = new THREE.Matrix4().extractRotation(m).transpose();
  const d = v3(dx, 0, dz).applyMatrix4(inv);
  return support(o, d.x, d.z);
}

interface Placed {
  stone: THREE.BufferGeometry;
  metal: THREE.BufferGeometry[];
  /** distance along the band from the centre to this stone's centre */
  along: number;
  /** half extent of this stone along the band, away from the centre */
  outerHalf: number;
  /** arc position of this stone's outer edge (chain the next stone from here) */
  outerArc: number;
  baseY: number;
}

/**
 * Place a stone beside the centre. along: + or - side of the band axis is given by sign.
 * The stone's inner edge sits `gap` mm from `innerEdge` (distance from the head centre along the band).
 */
function placeSide(
  ctx: HeadCtx,
  built: BuiltStone,
  sign: 1 | -1,
  innerEdge: number,
  gap: number,
  across: number,
  localX: [number, number],
  yDrop: number,
  tiltScale = 0.5,
  follow = true,
): Placed {
  const [ax, az] = ctx.bandAxis;
  const px = -az;
  const pz = ax;
  const o = cleanOutline(built.outline);
  const rotOnly = placeMatrix(0, 0, 0, localX[0], localX[1]);
  const innerHalf = supportWorld(o, rotOnly, -sign * ax, -sign * az);
  const outerHalf = supportWorld(o, rotOnly, sign * ax, sign * az);
  // Side stones sit on a circle concentric with the shank (same culet clearance as the centre stone, within reason),
  // tilted to follow the ring's curve, with their baskets standing on the shank.
  const cb = ctx.center.built;
  const clear = Math.min(1, Math.max(0.35, ctx.baseDrop - cb.pavilionDepth - cb.girdleThickness * 0.5));
  const Rs = ctx.innerRadius + 1.8; // shank top radius (estimate, as ringDrop)
  const stand = clear + built.pavilionDepth + built.girdleThickness * 0.5; // girdle height above the shank
  const Rg = Rs + stand;
  const arc = innerEdge + gap + innerHalf;
  // follow: on the circle (rows of stones); otherwise nearly level with the centre (pairs), on a taller basket
  const phi = follow ? Math.min(1.2, arc / Rg) : 0;
  const along = follow ? Rg * Math.sin(phi) : arc;
  const yRing = follow ? -(ctx.baseDrop + Rs) + Rg * Math.cos(phi) : -yDrop - ringDrop(ctx, along) * 0.35;
  const y = Math.min(-yDrop, yRing);
  const tilt = follow ? phi * tiltScale : Math.atan2(along, Rg) * tiltScale;
  const x = sign * ax * along + px * across;
  const z = sign * az * along + pz * across;
  const m = placeMatrix(x, y, z, localX[0], localX[1], tilt, sign * ax, sign * az);
  const seatY = -(ctx.baseDrop + ringDrop(ctx, along));
  // the seat is under the stone along its own (tilted) axis; sink it 0.1 mm into the shank
  const baseYLocal = -Math.max(0.3, (follow ? stand - (yRing - y) : y - seatY) / Math.cos(tilt) + 0.1);
  const p = ctx.params;
  const metal = prongSet(built, {
    count: Math.round(num(p, 'sideProngs', 4, 3, 6)),
    style: str(p, 'prongStyle', PRONG_STYLES, 'round'),
    wireMm: num(p, 'prongWidth', 0, 0, 1.6) * 0.85 || autoWireMm(built),
    baseY: baseYLocal,
    baseScale: 0.45,
    rails: [0.45],
  });
  transformAll(metal, m);
  const stone = built.geometry.clone().applyMatrix4(m);
  return { stone, metal, along, outerHalf, outerArc: arc + outerHalf, baseY: seatY };
}

/** Bars along the band joining the seats of neighbouring stones. */
function bridge(
  ctx: HeadCtx,
  a: number,
  b: number,
  yA: number,
  yB: number,
  r: number,
  across = 0,
): THREE.BufferGeometry[] {
  const [ax, az] = ctx.bandAxis;
  const px = -az;
  const pz = ax;
  const out: THREE.BufferGeometry[] = [];
  const half = Math.min(ctx.shankWidth * 0.3, 0.8);
  for (const k of [-1, 1]) {
    const off = across + k * half;
    // the ends sit on the two seats; in between the bar lies on the curved shank
    const pts = [v3(ax * a + px * off, yA + r, az * a + pz * off)];
    for (const t of [0.25, 0.5, 0.75]) {
      const at = a + (b - a) * t;
      const y = Math.max(-(ctx.baseDrop + ringDrop(ctx, at)), yA + (yB - yA) * t) + r * 0.9;
      pts.push(v3(ax * at + px * off, y, az * at + pz * off));
    }
    pts.push(v3(ax * b + px * off, yB + r, az * b + pz * off));
    out.push(...wire(pts, r, 16, 7));
  }
  return out;
}

function sideDims(ctx: HeadCtx, size: number, match: boolean): { cutId: string; dims: StoneDims } {
  if (match) {
    const c = ctx.center.dims;
    const k = size / Math.max(c.width, 0.1);
    return {
      cutId: ctx.center.cut.id,
      dims: { length: c.length * k, width: c.width * k, depth: c.depth * k },
    };
  }
  const cut = ctx.accent.cut;
  const d = accentDims(ctx, size * Math.max(1, cut.defaultAspect || 1), cut);
  return { cutId: cut.id, dims: d };
}

function multiStone(ctx: HeadCtx, perSide: 1 | 2): Part[] {
  const o = cleanOutline(ctx.center.built.outline);
  const p = ctx.params;
  const [ax, az] = ctx.bandAxis;
  const px = -az;
  const pz = ax;
  const centerAcross = 2 * Math.min(support(o, px, pz), support(o, -px, -pz));
  const ratio = num(p, 'sideRatio', perSide === 1 ? 0.62 : 0.6, 0.25, 1);
  const ratio2 = num(p, 'outerRatio', 0.72, 0.4, 1);
  const gap = num(p, 'sideGap', 0.35, 0, 2);
  const match = str(p, 'sideCut', ['accent', 'match'] as const, 'accent') === 'match';
  const opts = prongOpts(ctx, { count: 4, style: 'round', rails: 1 });
  const metal: THREE.BufferGeometry[] = [...prongSet(ctx.center.built, opts)];
  const stones: THREE.BufferGeometry[] = [];
  const r = opts.wireMm * 0.45;
  for (const sign of [-1, 1] as const) {
    let inner = support(o, sign * ax, sign * az);
    let lastAlong = 0;
    let lastY = -ctx.baseDrop;
    let size = centerAcross * ratio;
    for (let k = 0; k < perSide; k++) {
      const { cutId, dims } = sideDims(ctx, size, match);
      const built = ctx.stone(cutId, dims, { detail: perSide === 2 ? 'low' : 'full' });
      // elongated side stones run across the band (classic three-stone look)
      const localX: [number, number] = [sign * px, sign * pz];
      const drop = (centerAcross - size) * 0.12 + 0.1;
      const placed = placeSide(ctx, built, sign, inner, gap, 0, localX, drop, 0.9);
      stones.push(placed.stone);
      metal.push(...placed.metal);
      metal.push(...bridge(ctx, sign * lastAlong, sign * placed.along, lastY, placed.baseY, r));
      inner = placed.outerArc;
      lastAlong = placed.along;
      lastY = placed.baseY;
      size *= ratio2;
    }
  }
  return [
    metalPart(metal, perSide === 1 ? 'three-stone head' : 'five-stone head'),
    accentPart(stones, 'side stones'),
  ];
}

function toiEtMoi(ctx: HeadCtx): Part[] {
  const o = cleanOutline(ctx.center.built.outline);
  const p = ctx.params;
  const [ax, az] = ctx.bandAxis;
  const ratio = num(p, 'secondRatio', 0.85, 0.4, 1);
  const gap = num(p, 'secondGap', 0.4, 0, 2);
  const mirror = bool(p, 'mirrorSecond', true);
  const c = ctx.center.dims;
  const built = ctx.stone(
    ctx.center.cut.id,
    { length: c.length * ratio, width: c.width * ratio, depth: c.depth * ratio },
    { detail: 'full' },
  );
  const opts = prongOpts(ctx, { count: 4, style: 'claw', rails: 1 });
  const metal: THREE.BufferGeometry[] = [...prongSet(ctx.center.built, opts)];
  const localX: [number, number] = mirror ? [-1, 0] : [1, 0];
  const placed = placeSide(
    ctx,
    built,
    1,
    support(o, ax, az),
    gap,
    0,
    localX,
    (c.width - c.width * ratio) * 0.1,
    0.7,
  );
  metal.push(...placed.metal);
  metal.push(...bridge(ctx, 0, placed.along, -ctx.baseDrop, placed.baseY, opts.wireMm * 0.45));
  return [metalPart(metal, 'toi-et-moi head'), accentPart([placed.stone], 'second stone')];
}

function bypassHead(ctx: HeadCtx): Part[] {
  const o = cleanOutline(ctx.center.built.outline);
  const p = ctx.params;
  const [ax, az] = ctx.bandAxis;
  const px = -az;
  const pz = ax;
  const ratio = num(p, 'secondRatio', 0.7, 0.3, 1);
  const gap = num(p, 'secondGap', 0.2, -1, 2);
  const shift = num(p, 'bypassShift', 0.35, 0, 0.8);
  const match = str(p, 'secondCut', ['accent', 'match'] as const, 'accent') === 'match';
  const across = 2 * Math.min(support(o, px, pz), support(o, -px, -pz));
  const { cutId, dims } = sideDims(ctx, across * ratio, match);
  const built = ctx.stone(cutId, dims, { detail: 'full' });
  const opts = prongOpts(ctx, { count: 4, style: 'round', rails: 1 });
  const metal: THREE.BufferGeometry[] = [...prongSet(ctx.center.built, opts)];
  const off = across * shift;
  const placed = placeSide(
    ctx,
    built,
    1,
    support(o, ax, az) * 0.75,
    gap,
    off,
    [px, pz],
    across * (1 - ratio) * 0.1,
    0.3,
    false,
  );
  metal.push(...placed.metal);
  metal.push(...bridge(ctx, 0, placed.along, -ctx.baseDrop, placed.baseY, opts.wireMm * 0.45, off * 0.5));
  // two sweeping wires that pass either side of the pair, giving the "bypass" swoop
  const wr = num(p, 'swoopWidth', 1.4, 0.6, 2.5) / 2;
  const hc = support(o, ax, az);
  const wc = support(o, px, pz);
  const P = (along: number, acr: number, y: number) => v3(ax * along + px * acr, y, az * along + pz * acr);
  const endA = -Math.min(hc + 2.2, (ctx.innerRadius + 1.8) * 0.75);
  const endB = Math.min(placed.along + placed.outerHalf + 2.2, (ctx.innerRadius + 1.8) * 0.75);
  metal.push(
    ...wire(
      [
        P(endA, -off * 0.3, -(ctx.baseDrop + ringDrop(ctx, endA)) + wr),
        P(-hc * 0.6, -(wc + wr + 0.25), -Math.min(ctx.baseDrop * 0.6, 0.9)),
        P(placed.along * 0.5, -(wc * 0.5 + wr), -Math.min(ctx.baseDrop * 0.8, 1.4)),
        P(endB, off * 0.6, -(ctx.baseDrop + ringDrop(ctx, endB)) + wr),
      ],
      wr,
      32,
      10,
    ),
  );
  metal.push(
    ...wire(
      [
        P(endA, -off * 0.6, -(ctx.baseDrop + ringDrop(ctx, endA)) + wr),
        P(-hc * 0.2, wc * 0.5 + wr, -Math.min(ctx.baseDrop * 0.8, 1.4)),
        P(placed.along * 0.6, off + wc * ratio + wr + 0.25, -Math.min(ctx.baseDrop * 0.6, 0.9)),
        P(endB, off * 0.3, -(ctx.baseDrop + ringDrop(ctx, endB)) + wr),
      ],
      wr,
      32,
      10,
    ),
  );
  return [metalPart(metal, 'bypass head'), accentPart([placed.stone], 'bypass stone')];
}

registerHeadBuilder('three-stone', (ctx) => multiStone(ctx, 1));
registerHeadBuilder('five-stone', (ctx) => multiStone(ctx, 2));
registerHeadBuilder('toi-et-moi', toiEtMoi);
registerHeadBuilder('bypass-head', bypassHead);
