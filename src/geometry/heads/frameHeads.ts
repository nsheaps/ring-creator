/**
 * Framed heads: the polygon / cushion bezel (a collar whose outer outline is a hexagon, octagon or cushion while its
 * inner wall still hugs the stone's girdle) and the Art Deco domed plaque with pierced openwork.
 */
import * as THREE from 'three';
import { registerHeadBuilder } from '../builders';
import type { HeadCtx, Part } from '../types';
import { instanceGeometry, toFlat } from '../helpers';
import { collarDims, hugScale, type CollarDims } from './bezelHeads';
import {
  accentDims,
  accentPart,
  ball,
  bool,
  loft,
  cleanOutline,
  crownInset,
  loop,
  meanRadius,
  metalPart,
  num,
  offsetOutline,
  placeMatrix,
  pointAt,
  resample,
  ringDrop,
  shankTopRadius,
  str,
  support,
  templateOutline,
  v3,
  wire,
  type CleanOutline,
} from './common';
import {
  FRAME_SHAPES,
  cushionFrame,
  mixLoft,
  polygonFrame,
  radialPoint,
  type FrameShape,
  type MixPt,
} from './frameOutline';

/** The frame outline for the current params (the polygon's corner angles are returned for posts). */
export function frameFor(
  ctx: HeadCtx,
  o: CleanOutline,
  gap: number,
  defShape: FrameShape,
): { frame: CleanOutline; corners: number[] } {
  const p = ctx.params;
  const shape = str(p, 'frameShape', FRAME_SHAPES, defShape);
  if (shape === 'polygon') {
    const sides = Math.round(num(p, 'sides', 6, 3, 12));
    const rot = num(p, 'rotation', 0, -90, 90);
    const frame = polygonFrame(o, {
      sides,
      gap,
      rotationDeg: rot,
      corner: num(p, 'cornerRadius', 0.6, 0, 3),
      stretch: bool(p, 'stretch', true),
    });
    const phi0 = (sides % 4 === 0 ? Math.PI / sides : 0) + (rot * Math.PI) / 180;
    return { frame, corners: Array.from({ length: sides }, (_, i) => phi0 + (i / sides) * Math.PI * 2) };
  }
  const frame =
    shape === 'cushion'
      ? cushionFrame(o, gap)
      : shape === 'oval'
        ? templateOutline(o, 'oval', gap, 1.25, 128)
        : offsetOutline(o, gap, 128);
  return { frame, corners: Array.from({ length: 4 }, (_, i) => Math.PI / 4 + (i * Math.PI) / 2) };
}

/** Depth of the collar's wall below the girdle, mm. */
function wallDepth(ctx: HeadCtx, d: CollarDims): number {
  const w = num(ctx.params, 'wallDepth', 0, 0, 3);
  return w > 0 ? w : Math.min(1.0, Math.max(0.45, d.pd * 0.28, d.bd * 0.2));
}

/**
 * Polygon / cushion bezel: the inner wall hugs the girdle and burnishes over the crown like a bezel, but the outer
 * outline is a frame (hexagon, octagon, cushion ...) with an optional stepped second tier. Below the collar either a
 * solid skirt tapers to the seat or, when the gallery is open, slim posts rise from the frame's corners.
 */
function bezelFrame(ctx: HeadCtx, defShape: FrameShape): Part[] {
  const p = ctx.params;
  const d0 = collarDims(ctx);
  const gap = num(p, 'frameGap', 1.0, 0.3, 4);
  const { frame, corners } = frameFor(ctx, d0.o, gap, defShape);
  const [ax, az] = ctx.bandAxis;
  const reach = Math.max(support(frame, ax, az), support(frame, -ax, -az)) * d0.bs + 0.5;
  const d: CollarDims = { ...d0, bd: ctx.baseDrop + ringDrop(ctx, reach) };
  const R = Math.max(0.5, meanRadius(d.o));
  const crown = ctx.center.built.crownHeight;
  const g2 = d.gt * 0.5;
  const lip = num(p, 'bezelHeight', Math.min(0.25, crown * 0.2), 0.1, 1.5);
  const yTop = g2 + Math.min(lip, Math.max(0.1, crown * 0.4));
  const inset = Math.min(crownInset(ctx.center.built, yTop), 0.4);
  const kIn = Math.max(0.5, 1 - inset / R);
  const k03 = 1 - 0.03 / R;
  const tiers = Math.round(num(p, 'tiers', 2, 1, 2));
  const step = tiers === 2 ? Math.min(0.35, Math.max(0.15, gap * 0.25)) : 0;
  const open = str(p, 'gallery', ['open', 'solid'] as const, 'open') === 'open';
  const yColl = -g2 - wallDepth(ctx, d);
  const yCup = -Math.min(d.pd * 0.55, d.bd * 0.7);
  const yRim = yTop + 0.05;
  const sec: MixPt[] = [
    [0, yTop, kIn],
    [0.02, yRim, 1],
    [tiers === 2 ? 0.46 : 0.9, yRim],
  ];
  if (tiers === 2) sec.push([0.5, yRim - step], [0.9, yRim - step]);
  const yEdge = yRim - step;
  sec.push([0.98, yEdge - 0.03], [1, yEdge - 0.14], [1, yColl + 0.05]);
  if (open) {
    sec.push([0.92, yColl - 0.04], [0.5, yColl - 0.08, Math.min(1, hugScale(ctx, d, yColl) + 0.02)]);
    sec.push([0, yColl - 0.03, hugScale(ctx, d, yColl)]);
  } else {
    const span = d.bd + yColl;
    for (const f of [0.15, 0.35, 0.55, 0.75, 0.9]) {
      const y = yColl - span * f;
      const k = Math.max(d.bs, hugScale(ctx, d, y), 1 - f * (1 - d.bs) * 0.9);
      sec.push([1 - f * 0.1, y, k]);
    }
    sec.push([0.9, -d.bd, d.bs], [0, -d.bd, d.bs], [0, yCup, hugScale(ctx, d, yCup)]);
  }
  sec.push([0, -g2 - 0.08, 0.95], [0, -g2 - 0.02, k03], [0, g2, k03]);
  const geos: THREE.BufferGeometry[] = [mixLoft(d.o, frame, sec, 120)];
  if (open) {
    const r = Math.max(0.3, num(p, 'bezelThickness', 0.5, 0.35, 1.5) * 0.7);
    const ySeat = -d.bd + r * 0.9;
    const bs = Math.min(d.bs, 0.45);
    const ring: THREE.Vector3[] = [];
    for (const a of corners) {
      const [qx, qz] = radialPoint(frame, Math.cos(a), Math.sin(a));
      const top = v3(qx * 0.93, yColl + 0.1, qz * 0.93);
      const seat = v3(qx * bs, ySeat - ringDrop(ctx, qx * bs * ax + qz * bs * az), qz * bs);
      const at = (f: number) => {
        const e = f * f * (3 - 2 * f);
        return v3(top.x + (seat.x - top.x) * e, top.y + (seat.y - top.y) * f, top.z + (seat.z - top.z) * e);
      };
      geos.push(...wire([seat, at(0.7), at(0.4), at(0.15), top], r, 18, 8));
      ring.push(seat);
    }
    geos.push(loop(ring, r * 0.95, 48, 8));
  }
  // corner beads: a small bead at each corner of the frame, on the rim and just over the crown's edge
  if (bool(p, 'cornerBeads', false)) {
    const rb = num(p, 'beadSize', 0.7, 0.3, 1.4) / 2;
    for (const a of corners) {
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const rg = Math.hypot(...radialPoint(d.o, dx, dz));
      const rf = Math.hypot(...radialPoint(frame, dx, dz));
      const at = Math.min(rg + rb * 0.4, (rg + rf) / 2);
      geos.push(ball(v3(dx * at, yRim + rb * 0.55, dz * at), rb, 2));
    }
  }
  const out: Part[] = [metalPart(geos, 'framed bezel')];
  const sides = sideBezels(ctx, frame);
  if (sides) out.push(metalPart(sides.metal, 'side stone bezels'), accentPart(sides.stones, 'side stones'));
  return out;
}

/**
 * Side stones on the shoulders, each in its own small box bezel: `sideStones` per side in a row along the band,
 * starting just past the frame, following the curve of the shank (accent cut; baguettes lie along the band).
 */
function sideBezels(
  ctx: HeadCtx,
  frame: CleanOutline,
): { metal: THREE.BufferGeometry[]; stones: THREE.BufferGeometry[] } | null {
  const p = ctx.params;
  const n = Math.round(num(p, 'sideStones', 0, 0, 5));
  if (n === 0) return null;
  const size = num(p, 'sideStoneSize', 0, 0, 5) || ctx.accent.sizeMm || 2;
  const dims = accentDims(ctx, Math.max(0.8, size));
  const built = ctx.stone(ctx.accent.cut.id, dims, { detail: 'low' });
  const o = cleanOutline(built.outline);
  const path = resample(o, 64, 0);
  const wall = Math.min(0.4, Math.max(0.22, dims.width * 0.18));
  const lift = Math.min(0.35, built.crownHeight * 0.6 + 0.1); // girdle above the shank's top surface
  const lip = built.girdleThickness * 0.5 + Math.min(0.2, built.crownHeight * 0.35);
  const sink = lift + 0.45;
  const box = loft(
    path,
    [
      [0.02, lip, 1],
      [wall * 0.5, lip + 0.04, 1],
      [wall, lip - 0.03, 1],
      [wall, -sink, 1],
      [0, -sink, 1],
      [0, -built.girdleThickness * 0.5, 1],
    ],
    true,
  );
  const gap = num(p, 'sideStoneGap', 0.25, 0, 1.5);
  const pitch = dims.length + 2 * wall + gap;
  const Rs = shankTopRadius(ctx);
  const [ax, az] = ctx.bandAxis;
  const metal: THREE.BufferGeometry[] = [];
  const stones: THREE.BufferGeometry[] = [];
  for (const sign of [1, -1]) {
    const s0 = support(frame, sign * ax, sign * az) + gap + wall + dims.length / 2;
    for (let i = 0; i < n; i++) {
      const th = Math.min(1.2, (s0 + i * pitch) / Rs);
      const r = Rs + lift;
      const u = sign * r * Math.sin(th);
      const y = -ctx.baseDrop - Rs + r * Math.cos(th);
      const m = placeMatrix(u * ax, y, u * az, ax, az, th, sign * ax, sign * az);
      metal.push(box.clone().applyMatrix4(m));
      stones.push(toFlat(built.geometry).clone().applyMatrix4(m));
    }
  }
  return { metal, stones };
}

// ---------------------------------------------------------------------------------------------
// Art Deco plaque
// ---------------------------------------------------------------------------------------------

/**
 * Art Deco domed plaque: a bombe dome rising from a pierced polygon rim to a collar round the stone. The dome is a
 * lattice (radial ribs, a mid ring and the rim) over a deeper solid plate, so the openings read as pierced scrollwork;
 * milgrain beads run round the rim and small diamonds sit in it.
 */
function decoPlaque(ctx: HeadCtx): Part[] {
  const p = ctx.params;
  const d0 = collarDims(ctx);
  const gap = num(p, 'plaqueGap', 2.2, 0.8, 6);
  const { frame, corners } = frameFor(ctx, d0.o, gap, 'polygon');
  const [ax, az] = ctx.bandAxis;
  const reach = Math.max(support(frame, ax, az), support(frame, -ax, -az)) * d0.bs + 0.5;
  const d: CollarDims = { ...d0, bd: ctx.baseDrop + ringDrop(ctx, reach) };
  const crown = ctx.center.built.crownHeight;
  const g2 = d.gt * 0.5;
  const R = Math.max(0.5, meanRadius(d.o));
  const yTop = g2 + Math.min(0.3, Math.max(0.12, crown * 0.3));
  const inset = Math.min(crownInset(ctx.center.built, yTop), 0.4);
  const dome = num(p, 'domeHeight', 1.3, 0.4, 3);
  const yRim = Math.min(g2 - 0.1, yTop - dome);
  const ribs = Math.round(num(p, 'ribCount', 12, 6, 24));
  const rr = Math.max(0.18, num(p, 'ribWidth', 0.5, 0.25, 1) / 2);
  const geos: THREE.BufferGeometry[] = [];
  const domeY = (u: number) => yTop - (yTop - yRim) * u ** 2;
  // the plate under the lattice, one rib-radius deeper
  const kIn = Math.max(0.5, 1 - inset / R);
  const k03 = 1 - 0.03 / R;
  const yCup = -Math.min(d.pd * 0.55, d.bd * 0.7);
  const RIB_END = 0.7; // inside this the dome is pierced; outside it a solid jewelled band
  const plate: MixPt[] = [[0, yTop - 0.1, kIn]];
  for (const u of [0.15, 0.35, 0.55, RIB_END - 0.02]) plate.push([u, domeY(u) - rr * 1.3]);
  for (const u of [RIB_END, 0.8, 0.9, 0.97]) plate.push([u, domeY(u) - 0.04]);
  const yWall = Math.min(yRim - rr * 1.6, -g2 - 0.4);
  plate.push([1, yRim - rr * 0.6], [1, yWall]);
  const span = d.bd + yWall;
  for (const f of [0.15, 0.3, 0.5, 0.7, 0.88]) {
    const y = yWall - span * f;
    plate.push([1 - f * 0.1, y, Math.max(d.bs, d.bs + (1 - d.bs) * (1 - f) ** 2.4)]);
  }
  plate.push([0.88, -d.bd, d.bs], [0, -d.bd, d.bs], [0, yCup, Math.max(d.bs, 0.6)]);
  plate.push([0, -g2 - 0.08, 0.95], [0, -g2 - 0.02, k03], [0, g2, k03]);
  geos.push(mixLoft(d.o, frame, plate, 120));
  // lattice: radial ribs from the collar to the rim, following the dome
  const at = (a: number, u: number, lift = 0) => {
    const [ix, iz] = radialPoint(d.o, Math.cos(a), Math.sin(a));
    const [ox, oz] = radialPoint(frame, Math.cos(a), Math.sin(a));
    return v3(ix + (ox - ix) * u, domeY(u) + lift, iz + (oz - iz) * u);
  };
  const lift = rr * 0.4;
  for (let i = 0; i < ribs; i++) {
    const a = ((i + 0.5) / ribs) * Math.PI * 2;
    geos.push(
      ...wire(
        [0.04, 0.25, 0.45, 0.6, RIB_END].map((u) => at(a, u, lift)),
        rr,
        14,
        6,
      ),
    );
  }
  const ringAt = (u: number, r: number) =>
    geos.push(
      loop(
        Array.from({ length: 48 }, (_, i) => at((i / 48) * Math.PI * 2, u, lift)),
        r,
        96,
        6,
      ),
    );
  ringAt(0.08, rr * 1.1);
  ringAt(0.4, rr * 0.8);
  ringAt(RIB_END, rr * 1.1);
  ringAt(1, rr * 1.25);
  // milgrain: tiny beads along the rim and the inner collar
  const beadR = Math.max(0.1, rr * 0.42);
  const mats: THREE.Matrix4[] = [];
  const nb = Math.max(24, Math.round(frame.perimeter / (beadR * 2.6)));
  for (let i = 0; i < nb; i++) {
    const q = pointAt(frame, (i / nb) * frame.perimeter);
    const a = Math.atan2(q.z, q.x);
    const b = at(a, 1, rr * 1.2);
    mats.push(
      new THREE.Matrix4().makeTranslation(b.x + q.nx * rr * 0.9, b.y - rr * 0.3, b.z + q.nz * rr * 0.9),
    );
  }
  geos.push(instanceGeometry(toFlat(new THREE.IcosahedronGeometry(beadR, 1)), mats));
  // small diamonds set in the rim, tables tilted outward with the dome
  const stones: THREE.BufferGeometry[] = [];
  if (bool(p, 'rimStones', true)) {
    const size = Math.max(0.8, Math.min(2.2, num(p, 'stoneSize', 0, 0, 3) || ctx.accent.sizeMm || 1.4));
    const dims = accentDims(ctx, size);
    const built = ctx.stone(ctx.accent.cut.id, dims, { detail: 'low' });
    const U = 0.86;
    const ringPath = cleanOutline({
      points: Array.from({ length: 144 }, (_, i) => {
        const a = (i / 144) * Math.PI * 2;
        const [ix, iz] = radialPoint(d.o, Math.cos(a), Math.sin(a));
        const [ox, oz] = radialPoint(frame, Math.cos(a), Math.sin(a));
        return [ix + (ox - ix) * U, iz + (oz - iz) * U] as [number, number];
      }),
      corners: [],
    });
    const n = Math.max(8, Math.floor(ringPath.perimeter / (dims.length + 0.3)));
    const sm: THREE.Matrix4[] = [];
    for (let i = 0; i < n; i++) {
      const q = pointAt(ringPath, (i / n) * ringPath.perimeter);
      const y = domeY(U) - built.pavilionDepth * 0.25;
      sm.push(placeMatrix(q.x, y, q.z, q.tx, q.tz, 0.3, q.nx, q.nz));
    }
    stones.push(instanceGeometry(toFlat(built.geometry), sm));
  }
  // corner studs: a larger bead at each polygon corner
  for (const a of corners) geos.push(ball(at(a, 1, rr * 1.6), rr * 1.5, 1));
  const out: Part[] = [metalPart(geos, 'Art Deco plaque')];
  if (stones.length) out.push(accentPart(stones, 'plaque diamonds'));
  return out;
}

registerHeadBuilder('bezel-polygon', (ctx) => bezelFrame(ctx, 'polygon'));
registerHeadBuilder('bezel-cushion', (ctx) => bezelFrame(ctx, 'cushion'));
registerHeadBuilder('deco-plaque', decoPlaque);
