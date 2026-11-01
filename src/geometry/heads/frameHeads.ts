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
  const size = Math.max(0.8, num(p, 'sideStoneSize', 0, 0, 5) || ctx.accent.sizeMm || 2);
  // length:width of each side stone; 0 = the accent cut's own proportions
  const aspect = num(p, 'sideStoneAspect', 0, 0, 5);
  const dims =
    aspect >= 1
      ? {
          length: size,
          width: size / aspect,
          depth: (size / aspect) * (ctx.accent.cut.defaultDepthPct || 0.6),
        }
      : accentDims(ctx, size);
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

const PLAQUE_PATTERNS = ['web', 'sunburst'] as const;
const END_PANELS = ['plain', 'scroll'] as const;
/** V grooves in the floor of a deep-pierced plaque (see `pierceDepth`). */
const PIERCE_GROOVES = 8;
/** Metal left between a pierced plaque's groove bottoms and its underside, mm. */
const PIERCE_WALL = 0.3;
const RECESS_FINISHES = ['none', 'oxidised'] as const;
/** Thickness of the oxidised lining laid on the plate under the openwork (`recessFinish`), mm. */
const RECESS_SKIN = 0.04;

/**
 * A thin closed skin lying on a section polyline `floor` of a `mixLoft` (u, y points, u increasing outward): its
 * underside `lo` mm and its top `hi` mm above the floor, offset along the section's upward normal. `uMm` converts u to
 * millimetres (a mean collar-to-frame run) so the offset is square to steep walls too.
 */
function skinSection(floor: [number, number][], uMm: number, lo: number, hi: number): MixPt[] {
  const n = floor.length;
  const normals = floor.map((_, i) => {
    const [ua, ya] = floor[Math.max(0, i - 1)];
    const [ub, yb] = floor[Math.min(n - 1, i + 1)];
    const tx = (ub - ua) * uMm;
    const ty = yb - ya;
    const len = Math.hypot(tx, ty) || 1;
    return [-ty / len, tx / len] as const;
  });
  const at = (i: number, off: number): MixPt => [
    floor[i][0] + (normals[i][0] * off) / uMm,
    floor[i][1] + normals[i][1] * off,
  ];
  const top = floor.map((_, i) => at(i, hi));
  const bottom = floor.map((_, i) => at(i, lo)).reverse();
  return [...top, ...bottom];
}

/** Classic heart curve, t in [0, 2PI): cusp at (0, 5) between the lobes, point at (0, -17), widest +-16 at y = 4. */
function heartPt(t: number): [number, number] {
  const s = Math.sin(t);
  return [16 * s * s * s, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)];
}

/**
 * A solid blob lying on the dome over a star-shaped region: `outline` (closed) and `centre` are (angle, u) dome
 * positions; the top `top` mm above the dome surface, the bottom `bottom` mm below it, closed by a side wall.
 */
function domeBlob(
  at: (a: number, u: number, lift: number) => THREE.Vector3,
  centre: [number, number],
  outline: [number, number][],
  top: number,
  bottom: number,
): THREE.BufferGeometry {
  const nr = 5;
  const pos: number[] = [];
  const tri = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3) =>
    pos.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
  const quad = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3, s: THREE.Vector3) => {
    tri(p, q, r);
    tri(p, r, s);
  };
  const pt = (i: number, j: number, lift: number) => {
    const [a, u] = outline[i % outline.length];
    const f = j / nr;
    return at(centre[0] + (a - centre[0]) * f, centre[1] + (u - centre[1]) * f, lift);
  };
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < nr; j++) {
      quad(pt(i, j, top), pt(i, j + 1, top), pt(i + 1, j + 1, top), pt(i + 1, j, top));
      quad(pt(i, j, -bottom), pt(i + 1, j, -bottom), pt(i + 1, j + 1, -bottom), pt(i, j + 1, -bottom));
    }
    quad(pt(i, nr, top), pt(i, nr, -bottom), pt(i + 1, nr, -bottom), pt(i + 1, nr, top));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // wind outward whichever way round the outline runs
  if (signedVolumeFlat(pos) < 0) {
    const arr = g.getAttribute('position').array as Float32Array;
    for (let k = 0; k < arr.length; k += 9)
      for (let c = 0; c < 3; c++) {
        const t = arr[k + 3 + c];
        arr[k + 3 + c] = arr[k + 6 + c];
        arr[k + 6 + c] = t;
      }
  }
  g.computeVertexNormals();
  return g;
}

/** Signed volume of a flat triangle list. */
function signedVolumeFlat(pos: number[]): number {
  let v = 0;
  for (let k = 0; k + 8 < pos.length; k += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = pos.slice(k, k + 9);
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

/** The frame stretched by `e` along the band axis (ax, az); its corner angles follow the stretch. */
function stretchAlongBand(
  frame: CleanOutline,
  corners: number[],
  ax: number,
  az: number,
  e: number,
): { frame: CleanOutline; corners: number[] } {
  if (e === 1) return { frame, corners };
  const st = (x: number, z: number): [number, number] => {
    const t = (x * ax + z * az) * (e - 1);
    return [x + t * ax, z + t * az];
  };
  return {
    frame: cleanOutline({ points: frame.pts.map(([x, z]) => st(x, z)), corners: frame.corners }),
    corners: corners.map((a) => {
      const [x, z] = st(Math.cos(a), Math.sin(a));
      return Math.atan2(z, x);
    }),
  };
}

/** Smallest absolute difference between two angles, radians. */
function angleDiff(a: number, b: number): number {
  const d = (((a - b) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2);
  return Math.abs(d - Math.PI);
}

/**
 * A solid patch lying on the dome between angles a0..a1 and dome positions u0..u1: the top `top` mm above the dome
 * surface, the bottom `bottom` mm below it, closed by side walls.
 */
function domePatch(
  at: (a: number, u: number, lift: number) => THREE.Vector3,
  a0: number,
  a1: number,
  u0: number,
  u1: number,
  top: number,
  bottom: number,
): THREE.BufferGeometry {
  const na = 16;
  const nu = 8;
  const pos: number[] = [];
  const quad = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3, s: THREE.Vector3) =>
    pos.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z, p.x, p.y, p.z, r.x, r.y, r.z, s.x, s.y, s.z);
  const A = (i: number) => a0 + ((a1 - a0) * i) / na;
  const U = (j: number) => u0 + ((u1 - u0) * j) / nu;
  for (let i = 0; i < na; i++)
    for (let j = 0; j < nu; j++) {
      quad(
        at(A(i), U(j), top),
        at(A(i), U(j + 1), top),
        at(A(i + 1), U(j + 1), top),
        at(A(i + 1), U(j), top),
      );
      quad(
        at(A(i), U(j), -bottom),
        at(A(i + 1), U(j), -bottom),
        at(A(i + 1), U(j + 1), -bottom),
        at(A(i), U(j + 1), -bottom),
      );
    }
  for (let i = 0; i < na; i++) {
    quad(at(A(i), u0, -bottom), at(A(i), u0, top), at(A(i + 1), u0, top), at(A(i + 1), u0, -bottom));
    quad(at(A(i), u1, -bottom), at(A(i + 1), u1, -bottom), at(A(i + 1), u1, top), at(A(i), u1, top));
  }
  for (let j = 0; j < nu; j++) {
    quad(at(a0, U(j), -bottom), at(a0, U(j + 1), -bottom), at(a0, U(j + 1), top), at(a0, U(j), top));
    quad(at(a1, U(j), -bottom), at(a1, U(j), top), at(a1, U(j + 1), top), at(a1, U(j + 1), -bottom));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Art Deco domed plaque: a bombe dome rising from a pierced polygon rim to a collar round the stone. The dome is a
 * lattice (radial ribs, a mid ring and the rim) over a deeper solid plate, so the openings read as pierced scrollwork;
 * milgrain beads run round the rim and small diamonds sit in it.
 *
 * Optional extras, all off by default: `elongation` stretches the plaque along the band; `pattern: 'sunburst'` fans the
 * ribs out along the band only, over deep piercings, and leaves a solid cartouche at each end across the band holding
 * `cartoucheStones` small stones in milgrain cups; `ribMilgrain` beads every rib; `collarSides` frames the stone in a
 * polygon collar with a bead at each corner; `rimStoneCount` fixes the number of rim diamonds; `endPanel: 'scroll'`
 * (sunburst only) turns each cartouche into a raised heart of two lobes outlined in milgrain wire, over open piercing
 * with a scroll curl each side of its point, the cartouche stones one in each lobe; `pierceDepth` sinks the plate under
 * the openwork into a deep well of steep V grooves so the piercing reads dark; `recessFinish: 'oxidised'` lines the plate
 * under the openwork with a thin blackened skin (slot `head-recess`, the head's metal darkened), as antique plaques are.
 */
function decoPlaque(ctx: HeadCtx): Part[] {
  const p = ctx.params;
  const d0 = collarDims(ctx);
  const gap = num(p, 'plaqueGap', 2.2, 0.8, 6);
  const [ax, az] = ctx.bandAxis;
  const f0 = frameFor(ctx, d0.o, gap, 'polygon');
  const { frame, corners } = stretchAlongBand(f0.frame, f0.corners, ax, az, num(p, 'elongation', 1, 1, 1.8));
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
  const sunburst = str(p, 'pattern', PLAQUE_PATTERNS, 'web') === 'sunburst';
  const geos: THREE.BufferGeometry[] = [];
  const domeY = (u: number) => yTop - (yTop - yRim) * u ** 2;
  // the plate under the lattice, one rib-radius deeper (deeper still under a sunburst, so its slots read dark)
  const pierce = sunburst ? rr * 3 : rr * 1.3;
  const kIn = Math.max(0.5, 1 - inset / R);
  const k03 = 1 - 0.03 / R;
  const yCup = -Math.min(d.pd * 0.55, d.bd * 0.7);
  const RIB_END = 0.7; // inside this the dome is pierced; outside it a solid jewelled band
  const plate: MixPt[] = [[0, yTop - 0.1, kIn]];
  // the plate's outer wall drops from the rim to yWall, then tapers in to the base (-d.bd) where it meets the shank
  const yWall = Math.min(yRim - rr * 1.6, -g2 - 0.4);
  const span = d.bd + yWall;
  const underside: MixPt[] = [[1, yWall]];
  for (const f of [0.15, 0.3, 0.5, 0.7, 0.88])
    underside.push([1 - f * 0.1, yWall - span * f, Math.max(d.bs, d.bs + (1 - d.bs) * (1 - f) ** 2.4)]);
  underside.push([0.88, -d.bd, d.bs]);
  // `pierceDepth` sinks the plate under the openwork into a deep well whose floor is a ring of steep V grooves: their
  // walls mirror the darker lower studio instead of the bright ceiling, so the slots between the ribs read as piercing.
  // The grooves stop a wall's thickness inside the tapering underside, so they never poke out below the plaque.
  const well = num(p, 'pierceDepth', 0, 0, 3);
  if (well > 0) {
    const ro = meanRadius(frame);
    const radius = (u: number, k = 1) => k * ((1 - u) * R + u * ro);
    /** height of the plate's underside below a floor point at dome position u (mean outlines) */
    const below = (u: number): number => {
      const r = radius(u);
      for (let i = 0; i + 1 < underside.length; i++) {
        const [ua, ya, ka] = underside[i];
        const [ub, yb, kb] = underside[i + 1];
        const [ra, rb] = [radius(ua, ka), radius(ub, kb)];
        if (r <= ra && r >= rb) return ya + ((yb - ya) * (ra - r)) / Math.max(1e-6, ra - rb);
      }
      return r > radius(1) ? yWall : -d.bd;
    };
    const [u0, u1] = [0.1, RIB_END - 0.04];
    const steps = 2 * PIERCE_GROOVES;
    plate.push([u0, domeY(u0) - pierce]);
    for (let i = 1; i < steps; i++) {
      const u = u0 + ((u1 - u0) * i) / steps;
      const top = domeY(u) - pierce;
      const floorY = Math.max(below(u) + PIERCE_WALL, top - (i % 2 ? well : well * 0.2));
      plate.push([u, Math.min(top, floorY)]);
    }
    plate.push([u1, domeY(u1) - pierce]);
  } else for (const u of [0.15, 0.35, 0.55, RIB_END - 0.02]) plate.push([u, domeY(u) - pierce]);
  // the floor under the openwork (well or shallow plate), for the oxidised lining
  const floor = plate.slice(1).map(([u, y]) => [u, y] as [number, number]);
  for (const u of [RIB_END, 0.8, 0.9, 0.97]) plate.push([u, domeY(u) - 0.04]);
  plate.push([1, yRim - rr * 0.6], ...underside);
  plate.push([0, -d.bd, d.bs], [0, yCup, Math.max(d.bs, 0.6)]);
  plate.push([0, -g2 - 0.08, 0.95], [0, -g2 - 0.02, k03], [0, g2, k03]);
  geos.push(mixLoft(d.o, frame, plate, 120));
  // a point on the dome: angle a round the stone, u from the collar (0) to the rim (1), `lift` above the surface
  const at = (a: number, u: number, lift = 0) => {
    const [ix, iz] = radialPoint(d.o, Math.cos(a), Math.sin(a));
    const [ox, oz] = radialPoint(frame, Math.cos(a), Math.sin(a));
    return v3(ix + (ox - ix) * u, domeY(u) + lift, iz + (oz - iz) * u);
  };
  const lift = rr * 0.4;
  const beadR = Math.max(0.1, rr * 0.42);
  const U_COLLAR = 0.04;
  const ribBeads: THREE.Matrix4[] = [];
  const ribMilgrain = bool(p, 'ribMilgrain', false);
  const RIB_US = [U_COLLAR, 0.25, 0.45, 0.6, RIB_END];
  const rib = (a: number) => {
    const pts = RIB_US.map((u) => at(a, u, lift));
    geos.push(...wire(pts, rr, 14, 6));
    if (!ribMilgrain) return;
    const n = pts.length;
    const [u0, u1] = [U_COLLAR, RIB_END];
    // a row of milgrain beads along the crest of the rib
    const len = pts[0].distanceTo(pts[n - 1]);
    const nb = Math.max(3, Math.round(len / (beadR * 2.4)));
    for (let i = 0; i <= nb; i++) {
      const q = at(a, u0 + ((u1 - u0) * i) / nb, lift + rr * 0.85);
      ribBeads.push(new THREE.Matrix4().makeTranslation(q.x, q.y, q.z));
    }
  };
  // cartouches: the solid ends across the band (sunburst only)
  const aBand = Math.atan2(az, ax);
  const CART_HALF = (40 * Math.PI) / 180;
  const cartCentres = sunburst ? [aBand + Math.PI / 2, aBand - Math.PI / 2] : [];
  const inCartouche = (a: number, margin = 0) =>
    cartCentres.some((c) => angleDiff(a, c) < CART_HALF + margin);
  // scroll end panels: each cartouche becomes a raised heart of two lobes outlined in milgrain wire, over open piercing
  // with a scroll curl each side of its point
  const scroll = sunburst && str(p, 'endPanel', END_PANELS, 'plain') === 'scroll';
  const horiz = (a: number, u: number) => {
    const q = at(a, u);
    return Math.hypot(q.x, q.z);
  };
  /** local panel coordinates (mm along the arc x, mm outward y, about the point (c, uc)) to dome (angle, u) */
  const panelMap = (c: number) => {
    const L = Math.max(0.5, at(c, 0).setY(0).distanceTo(at(c, 1).setY(0)));
    const halfW = horiz(c, 0.5) * CART_HALF * 0.9;
    // the heart spans the dome from just outside the collar to just inside the rim, a little wider than tall
    const ky = (0.9 * L) / 29;
    const kx = Math.min(halfW / 16, ky * 1.4);
    const uc = 0.07 + (17 * ky) / L;
    const toDome = (x: number, y: number): [number, number] => {
      const u = uc + y / L;
      return [c + x / Math.max(0.5, horiz(c, u)), u];
    };
    return { kx, ky, toDome };
  };
  const panelBeads: THREE.Matrix4[] = [];
  const scrollLobes: [number, number][] = [];
  let lobeMm = Infinity;
  if (!sunburst) {
    // lattice: radial ribs from the collar to the rim, following the dome
    for (let i = 0; i < ribs; i++) rib(((i + 0.5) / ribs) * Math.PI * 2);
  } else {
    // sunburst: ribs fan out along the band on each side, between the two cartouches
    const perSide = Math.max(3, Math.round(ribs / 2));
    const fan = Math.PI - 2 * CART_HALF;
    for (const side of [0, Math.PI])
      for (let i = 0; i <= perSide; i++) rib(aBand + side - fan / 2 + (fan * i) / perSide);
    for (const c of cartCentres) {
      if (!scroll) {
        geos.push(domePatch(at, c - CART_HALF, c + CART_HALF, 0.05, RIB_END, rr * 0.9, pierce));
        continue;
      }
      const { kx, ky, toDome } = panelMap(c);
      const N = 72;
      const heart = Array.from({ length: N }, (_, i) => heartPt((i / N) * Math.PI * 2));
      // the raised heart panel, its foot sunk into the plate below the piercing
      geos.push(
        domeBlob(
          at,
          toDome(0, -2 * ky),
          heart.map(([x, y]) => toDome(x * kx, y * ky)),
          rr * 0.9,
          pierce + 0.05,
        ),
      );
      // raised milgrain outline round the heart and down its middle, between the lobes
      const wl = rr * 0.9 + rr * 0.35;
      const edge = heart.map(([x, y]) => {
        const [a, u] = toDome(x * kx, y * ky);
        return at(a, u, wl);
      });
      geos.push(loop(edge, rr * 0.6, N * 2, 6));
      const mid = [5, 0, -6, -12, -17].map((y) => {
        const [a, u] = toDome(0, y * ky);
        return at(a, u, wl);
      });
      geos.push(...wire(mid, rr * 0.5, 16, 6));
      for (const path of [edge, mid]) {
        const closed = path === edge;
        let len = 0;
        const seg: number[] = [];
        for (let i = 0; i + (closed ? 0 : 1) < path.length; i++) {
          const d = path[i].distanceTo(path[(i + 1) % path.length]);
          seg.push(d);
          len += d;
        }
        const nb = Math.max(6, Math.round(len / (beadR * 2.3)));
        for (let k = 0; k < nb; k++) {
          let sArc = (k / nb) * len;
          let i = 0;
          while (i < seg.length - 1 && sArc > seg[i]) sArc -= seg[i++];
          const q = path[i]
            .clone()
            .lerp(path[(i + 1) % path.length], Math.min(1, sArc / Math.max(1e-6, seg[i])));
          panelBeads.push(new THREE.Matrix4().makeTranslation(q.x, q.y + rr * 0.55, q.z));
        }
      }
      // a scroll curl in the open piercing each side of the heart's point
      for (const side of [-1, 1]) {
        const cx = side * 11.5 * kx;
        const cy = -9 * ky;
        const rs = Math.min(4.5 * kx, 5 * ky);
        const curl = Array.from({ length: 28 }, (_, i) => {
          const f = i / 27;
          const ang = side * (Math.PI * 0.5 + f * Math.PI * 3);
          const r = rs * (1 - 0.75 * f);
          const [a, u] = toDome(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
          return at(a, u, 0);
        });
        geos.push(...wire(curl, rr * 0.55, 56, 6));
      }
      for (const side of [-1, 1]) scrollLobes.push(toDome(side * 8.5 * kx, 4 * ky));
      lobeMm = Math.min(lobeMm, 12 * Math.min(kx, ky));
    }
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
  const collarSides = Math.round(num(p, 'collarSides', 0, 0, 12));
  if (collarSides >= 3) {
    // polygon collar: straight milgrain edges round the stone with a bead at each corner, like an octagonal cup
    const c0 = aBand + Math.PI / collarSides;
    const cr = 1 / Math.cos(Math.PI / collarSides);
    const vtx = Array.from({ length: collarSides }, (_, i) => {
      const a = c0 + (i / collarSides) * Math.PI * 2;
      const [x, z] = radialPoint(d.o, Math.cos(a), Math.sin(a));
      const k = cr + (rr * 0.8) / Math.max(0.5, Math.hypot(x, z));
      return v3(x * k, domeY(U_COLLAR) + lift + rr * 0.3, z * k);
    });
    const edge: THREE.Vector3[] = [];
    for (let i = 0; i < collarSides; i++) {
      const a = vtx[i];
      const b = vtx[(i + 1) % collarSides];
      for (let k = 0; k < 6; k++) edge.push(a.clone().lerp(b, k / 6));
    }
    geos.push(loop(edge, rr * 1.1, collarSides * 12, 6));
    for (const v of vtx) geos.push(ball(v3(v.x, v.y + rr * 0.6, v.z), rr * 1.35, 1));
  } else ringAt(0.08, rr * 1.1);
  if (!sunburst) ringAt(0.4, rr * 0.8);
  ringAt(RIB_END, rr * 1.1);
  ringAt(1, rr * 1.25);
  // milgrain: tiny beads along the rim and the inner collar
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
  if (ribBeads.length)
    geos.push(instanceGeometry(toFlat(new THREE.IcosahedronGeometry(beadR * 0.9, 0)), ribBeads));
  if (panelBeads.length)
    geos.push(instanceGeometry(toFlat(new THREE.IcosahedronGeometry(beadR * 0.85, 0)), panelBeads));
  // small accent stones in milgrain cups lying on the dome at (angle, u) sites, tables tilted with the slope
  const cupStones = (size: number, sites: [number, number][], raise = 0): THREE.BufferGeometry => {
    const dims = accentDims(ctx, size);
    const built = ctx.stone(ctx.accent.cut.id, dims, { detail: 'low' });
    const rc = Math.max(dims.length, dims.width) / 2 + rr * 0.35;
    const sm: THREE.Matrix4[] = [];
    for (const [a, u] of sites) {
      const q = at(a, u, rr * 0.9 + raise);
      const qo = at(a, Math.min(1, u + 0.05), rr * 0.9 + raise);
      const qi = at(a, u - 0.05, rr * 0.9 + raise);
      const run = Math.max(1e-3, Math.hypot(qo.x - qi.x, qo.z - qi.z));
      const tilt = Math.min(0.45, Math.atan2(qi.y - qo.y, run)); // set a little flatter than a steep slope
      const nx = (qo.x - qi.x) / run;
      const nz = (qo.z - qi.z) / run;
      const m = placeMatrix(q.x, q.y - built.crownHeight * 0.35, q.z, -nz, nx, tilt, nx, nz);
      sm.push(m);
      // the cup: a milgrain wire collar round the girdle
      const ring = (r: number, y: number) =>
        Array.from({ length: 24 }, (_, k) => {
          const t = (k / 24) * Math.PI * 2;
          return v3(Math.cos(t) * r, y, Math.sin(t) * r).applyMatrix4(m);
        });
      geos.push(loop(ring(rc, built.crownHeight * 0.15), rr * 0.45, 32, 6));
    }
    return instanceGeometry(toFlat(built.geometry), sm);
  };
  // small diamonds set in the rim, tables tilted outward with the dome
  const stones: THREE.BufferGeometry[] = [];
  const rimCount = Math.round(num(p, 'rimStoneCount', 0, 0, 40));
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
    const y = domeY(U) - built.pavilionDepth * 0.25;
    const sm: THREE.Matrix4[] = [];
    if (sunburst) {
      // the rim stones are set in cups on the dome along the two fan sides, clear of the cartouches
      const perSide = Math.max(1, Math.round((rimCount || 6) / 2));
      const fan = Math.PI - 2 * CART_HALF;
      const sites: [number, number][] = [];
      for (const side of [0, Math.PI])
        for (let i = 0; i < perSide; i++)
          sites.push([aBand + side - fan / 2 + (fan * (i + 0.5)) / perSide, 0.82]);
      stones.push(cupStones(size, sites));
    } else {
      const n = rimCount || Math.max(8, Math.floor(ringPath.perimeter / (dims.length + 0.3)));
      for (let i = 0; i < n; i++) {
        const q = pointAt(ringPath, (i / n) * ringPath.perimeter);
        sm.push(placeMatrix(q.x, y, q.z, q.tx, q.tz, 0.3, q.nx, q.nz));
      }
    }
    if (sm.length) stones.push(instanceGeometry(toFlat(built.geometry), sm));
  }
  // cartouche stones: small stones in milgrain cups on each cartouche, out towards the rim
  const nCart = sunburst ? Math.round(num(p, 'cartoucheStones', 0, 0, 3)) : 0;
  if (nCart > 0) {
    let size = Math.max(0.8, Math.min(2.4, num(p, 'cartoucheSize', 0, 0, 3) || ctx.accent.sizeMm || 1.4));
    const sites: [number, number][] = [];
    if (scroll) {
      // one stone in each lobe of the heart (one stone: on the heart's middle line), sized to sit inside its outline
      size = Math.max(0.6, Math.min(size, lobeMm));
      if (nCart === 1) for (const c of cartCentres) sites.push(panelMap(c).toDome(0, -2 * panelMap(c).ky));
      else sites.push(...scrollLobes);
    } else
      for (const c of cartCentres)
        for (let i = 0; i < nCart; i++)
          sites.push([c + (nCart === 1 ? 0 : CART_HALF * 0.5 * ((2 * i) / (nCart - 1) - 1)), 0.55]);
    // on a scroll heart the stones sit up on the raised panel
    stones.push(cupStones(size, sites, scroll ? rr * 0.6 : 0));
  }
  // corner studs: a larger bead at each polygon corner
  for (const a of corners) if (!inCartouche(a, -0.2)) geos.push(ball(at(a, 1, rr * 1.6), rr * 1.5, 1));
  const out: Part[] = [metalPart(geos, 'Art Deco plaque')];
  if (str(p, 'recessFinish', RECESS_FINISHES, 'none') === 'oxidised') {
    const uMm = Math.max(0.5, meanRadius(frame) - R);
    out.push({
      slot: 'head-recess',
      geometry: mixLoft(d.o, frame, skinSection(floor, uMm, 0.005, RECESS_SKIN), 120),
      label: 'oxidised recess',
    });
  }
  if (stones.length) out.push(accentPart(stones, 'plaque diamonds'));
  return out;
}

registerHeadBuilder('bezel-polygon', (ctx) => bezelFrame(ctx, 'polygon'));
registerHeadBuilder('bezel-cushion', (ctx) => bezelFrame(ctx, 'cushion'));
registerHeadBuilder('deco-plaque', decoPlaque);
