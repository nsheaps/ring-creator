/**
 * Stone-set bands: half-eternity, three-quarter-eternity, full-eternity, shared-prong, channel-band, pave-band, bezel-band.
 * Stones are the band's accent stone (ctx.accent), built with detail 'low' and merged into one 'band-stone' part.
 */
import * as THREE from 'three';
import { registerBandBuilder } from '../builders';
import type { BandCtx, Part } from '../types';
import {
  accentStone,
  arcMask,
  bool,
  clamp,
  contourZ,
  COVERAGES,
  coverageArc,
  cup,
  dims,
  instances,
  makeSection,
  milgrainRow,
  num,
  part,
  parts,
  ringFrame,
  ringPt,
  rod,
  segs,
  stations,
  str,
  sweep,
  sweepSection,
  type Coverage,
  type Section,
  type ZFn,
} from './common';

export const SETTINGS = ['shared-prong', 'channel', 'bezel'] as const;
export type Setting = (typeof SETTINGS)[number];

/** Target stone width across the band: param `stoneSize` (0 = the accent size), never wider than `maxW`. */
function stoneWidth(ctx: BandCtx, maxW: number): number {
  const want = num(ctx.params, 'stoneSize', 0, 0, 6);
  const w = want > 0 ? want : ctx.accent.sizeMm;
  return clamp(w, 0.8, Math.max(0.8, maxW));
}

/** Prong wire radius for a stone of width w. */
const prongR = (w: number) => clamp(0.11 * w + 0.12, 0.22, 0.48);

/** Body under set stones: flat-topped, slightly rounded edges, comfort inside. */
function seatSection(W: number, T: number, R: number): Section {
  return makeSection(W, T, R, {
    dome: T * 0.06,
    innerDome: Math.min(T * 0.15, 0.25),
    corner: Math.min(T * 0.35, W * 0.2),
  });
}

interface Row {
  stones: THREE.BufferGeometry[];
  metal: THREE.BufferGeometry[];
}

// ---------------------------------------------------------------------------------------------
// Shared-prong eternity
// ---------------------------------------------------------------------------------------------

function sharedProngRow(ctx: BandCtx, cov: Coverage, z: ZFn | undefined): Part[] {
  const { W, T, R } = dims(ctx);
  // widest stone whose edge prongs stay inside the band width
  let w = stoneWidth(ctx, W);
  for (let i = 0; i < 20 && w / 2 + prongR(w) * 0.75 > W / 2 - 0.02; i++) w *= 0.95;
  const st = accentStone(ctx, w);
  const gap = num(ctx.params, 'gapMm', 0.25, 0.05, 1.5);
  const rTop = R + T;
  // girdle a little above the metal; keep the culet inside the metal
  const rg = Math.max(rTop + st.built.crownHeight * 0.1, R + st.built.pavilionDepth + 0.25);
  const body = seatSection(W, T, R);
  const arc = coverageArc(cov);
  const pitch = st.length + gap;
  const angles = stations(arc[0], arc[1], rg, pitch);
  const row: Row = { stones: [], metal: [sweepSection(body, { z })] };
  row.stones.push(
    ...instances(
      st.built.geometry,
      angles.map((t) => ringFrame(t, 0, rg, z)),
    ),
  );
  const pr = prongR(w);
  const full = cov === 'full';
  const dA = angles.length > 1 ? angles[1] - angles[0] : 0.3;
  const prongAngles: number[] = [];
  for (let i = 0; i < angles.length; i++) {
    if (i > 0 || full) prongAngles.push(angles[i] - dA / 2);
  }
  prongAngles.push(angles[angles.length - 1] + dA / 2);
  if (full) prongAngles.pop();
  const zEdge = w / 2 - pr * 0.25;
  const tipR = rg + st.built.crownHeight * 0.45;
  for (const t of prongAngles)
    for (const u of [-zEdge, zEdge]) {
      const a = ringPt(t, u, rTop - 0.3, z);
      const b = ringPt(t, u, tipR, z);
      row.metal.push(...rod(a, b, pr, pr * 0.9));
    }
  return parts(
    part('band-metal', row.metal, `shared-prong ${cov}`),
    part('band-stone', row.stones, 'eternity stones'),
  );
}

// ---------------------------------------------------------------------------------------------
// Channel
// ---------------------------------------------------------------------------------------------

function channelRow(ctx: BandCtx, cov: Coverage, z: ZFn | undefined): Part[] {
  const { W, T, R } = dims(ctx);
  const wall = clamp(num(ctx.params, 'wallMm', 0.45, 0.25, 1), 0.25, W * 0.25);
  let w = stoneWidth(ctx, W - 2 * wall + 0.1);
  const rTop = R + T;
  let st = accentStone(ctx, w);
  // the stone must sit below the wall tops with its culet above the inner surface
  for (let i = 0; i < 20 && rTop - st.built.crownHeight - 0.05 - st.built.pavilionDepth < R + 0.2; i++) {
    w *= 0.92;
    st = accentStone(ctx, w);
  }
  const rg = rTop - st.built.crownHeight * 0.85 - 0.05;
  const floor = rg - st.built.pavilionDepth * 0.35;
  const s = seatSection(W, T, R);
  const arc = coverageArc(cov);
  const half = W / 2;
  const inner = half - wall;
  const n = 8;
  // U-profile: outer bottom, right wall, groove (depth masked to the arc), left wall.
  const g = sweep({
    segments: segs(cov === 'full' ? 128 : 192, z),
    zOffset: z,
    smoothProfile: false,
    profile: (theta) => {
      const m = arcMask(theta, arc);
      const fl = s.top(0) + (floor - s.top(0)) * m;
      const pts: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        const u = -half + (2 * half * i) / (n - 1);
        pts.push([u, s.bot(u)]);
      }
      pts.push([half, s.top(half)]);
      pts.push([inner, s.top(inner)]);
      pts.push([inner, Math.min(fl, s.top(inner) - 0.01)]);
      pts.push([-inner, Math.min(fl, s.top(-inner) - 0.01)]);
      pts.push([-inner, s.top(-inner)]);
      pts.push([-half, s.top(-half)]);
      return pts;
    },
  });
  const gap = num(ctx.params, 'gapMm', 0.08, 0, 1);
  const angles = stations(arc[0], arc[1], rg, st.length + gap);
  const stones = instances(
    st.built.geometry,
    angles.map((t) => ringFrame(t, 0, rg, z)),
  );
  return parts(part('band-metal', [g], `channel ${cov}`), part('band-stone', stones, 'channel stones'));
}

// ---------------------------------------------------------------------------------------------
// Bezel stations
// ---------------------------------------------------------------------------------------------

function bezelRow(ctx: BandCtx, cov: Coverage, z: ZFn | undefined, frameSides = 24, spin = 0): Part[] {
  const { W, T, R } = dims(ctx);
  const bz = num(ctx.params, 'bezelWall', 0.3, 0.15, 0.6);
  const grow = frameSides === 4 ? 1.1 : 1;
  let w = stoneWidth(ctx, W - 2 * bz - 0.05);
  let st = accentStone(ctx, w);
  for (let i = 0; i < 30 && (Math.max(st.length, st.width) / 2 + bz) * grow > W / 2 - 0.02; i++) {
    w *= 0.94;
    st = accentStone(ctx, w);
  }
  const bodyT = Math.max(0.9, T * num(ctx.params, 'bodyPct', 0.75, 0.4, 1));
  const body = seatSection(Math.min(W, Math.max(1.4, w * 0.75)), bodyT, R);
  const rTop = R + bodyT;
  const rg = Math.max(rTop + 0.15, R + st.built.pavilionDepth + 0.2);
  const ro = Math.max(st.length, st.width) / 2 + bz;
  const ri = Math.max(st.length, st.width) / 2 - 0.08;
  const cupGeo = cup(
    Math.max(0.1, ri * grow),
    ro * grow,
    rTop - rg - 0.3,
    st.built.crownHeight * 0.3,
    frameSides,
  );
  const spacing = num(ctx.params, 'spacingMm', 1.2, 0, 8);
  const arc = coverageArc(cov);
  const angles = stations(arc[0], arc[1], rg, 2 * ro + spacing);
  const frames = angles.map((t) => ringFrame(t, 0, rg, z, spin));
  return parts(
    part('band-metal', [sweepSection(body, { z }), ...instances(cupGeo, frames)], `bezel ${cov}`),
    part(
      'band-stone',
      instances(
        st.built.geometry,
        angles.map((t) => ringFrame(t, 0, rg, z)),
      ),
      'bezel stones',
    ),
  );
}

// ---------------------------------------------------------------------------------------------
// Pave
// ---------------------------------------------------------------------------------------------

function paveRow(ctx: BandCtx, cov: Coverage, z: ZFn | undefined): Part[] {
  const { W, T, R } = dims(ctx);
  const rows = Math.round(num(ctx.params, 'rows', 1, 1, 3));
  const edge = bool(ctx.params, 'milgrainEdges', true);
  const rim = edge ? 0.45 : 0.25;
  const usable = W - 2 * rim;
  const w = clamp(Math.min(stoneWidth(ctx, 2.2), usable / rows - 0.12), 0.8, 2.2);
  const st = accentStone(ctx, w, 'round-brilliant');
  const s = makeSection(W, T, R, {
    dome: 0,
    innerDome: Math.min(T * 0.15, 0.25),
    corner: Math.min(0.25, T * 0.2),
    bevel: 0,
  });
  const rTop = s.top(0);
  const rg = Math.max(rTop - st.built.crownHeight * 0.35, R + st.built.pavilionDepth + 0.15);
  const arc = coverageArc(cov);
  const pitch = st.length + 0.12;
  const rowU = Array.from({ length: rows }, (_, i) => (i - (rows - 1) / 2) * (w + 0.12));
  const stoneMats: THREE.Matrix4[] = [];
  const beadMats: THREE.Matrix4[] = [];
  const beadR = clamp(w * 0.16 + 0.05, 0.13, 0.3);
  const beadU = rowU.map((u) => [u - w / 2 - 0.02, u + w / 2 + 0.02]).flat();
  const base = stations(arc[0], arc[1], rg, pitch);
  const dA = base.length > 1 ? base[1] - base[0] : pitch / rg;
  rowU.forEach((u, ri) => {
    const off = ri % 2 === 1 ? dA / 2 : 0;
    for (const t of base) {
      if (off && cov !== 'full' && t + off > arc[1]) continue;
      stoneMats.push(ringFrame(t + off, u, rg, z));
    }
  });
  const uniqueBeadU = Array.from(new Set(beadU.map((u) => Math.round(u * 1000) / 1000)));
  for (const u of uniqueBeadU)
    for (const t of base) beadMats.push(ringFrame(t + dA / 2, u, rg + st.built.crownHeight * 0.2, z));
  const metal: THREE.BufferGeometry[] = [
    sweepSection(s, { z, smooth: false }),
    ...instances(new THREE.SphereGeometry(beadR, 7, 4), beadMats),
  ];
  if (edge) {
    const mb = 0.17;
    metal.push(...milgrainRow(s, -(W / 2 - mb - 0.08), mb, z), ...milgrainRow(s, W / 2 - mb - 0.08, mb, z));
  }
  return parts(
    part('band-metal', metal, `pave ${cov}`),
    part('band-stone', instances(st.built.geometry, stoneMats), 'pave stones'),
  );
}

function row(ctx: BandCtx, defSetting: Setting, defCov: Coverage): Part[] {
  const cov = str(ctx.params, 'coverage', COVERAGES, defCov);
  const setting = str(ctx.params, 'setting', SETTINGS, defSetting);
  const z = contourZ(ctx);
  if (setting === 'channel') return channelRow(ctx, cov, z);
  if (setting === 'bezel') return bezelRow(ctx, cov, z);
  return sharedProngRow(ctx, cov, z);
}

registerBandBuilder('half-eternity', (ctx) => row(ctx, 'shared-prong', 'half'));
registerBandBuilder('three-quarter-eternity', (ctx) => row(ctx, 'shared-prong', 'three-quarter'));
registerBandBuilder('full-eternity', (ctx) => row(ctx, 'shared-prong', 'full'));
registerBandBuilder('shared-prong', (ctx) => row(ctx, 'shared-prong', 'half'));
registerBandBuilder('channel-band', (ctx) =>
  channelRow(ctx, str(ctx.params, 'coverage', COVERAGES, 'half'), contourZ(ctx)),
);
registerBandBuilder('bezel-band', (ctx) =>
  bezelRow(ctx, str(ctx.params, 'coverage', COVERAGES, 'half'), contourZ(ctx)),
);
registerBandBuilder('pave-band', (ctx) =>
  paveRow(ctx, str(ctx.params, 'coverage', COVERAGES, 'half'), contourZ(ctx)),
);

export { bezelRow };
