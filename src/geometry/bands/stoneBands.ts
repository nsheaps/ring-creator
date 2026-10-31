/**
 * Stone-set bands: half-eternity, three-quarter-eternity, full-eternity, shared-prong, channel-band, pave-band, bezel-band.
 * Stones are the band's accent stone (ctx.accent), built with detail 'low' and merged into one 'band-stone' part.
 */
import * as THREE from 'three';
import { registerBandBuilder } from '../builders';
import { fitStones, type ProfilePoint } from '../helpers';
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
  slicePoly,
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

// ---------------------------------------------------------------------------------------------
// Shared-prong eternity
// ---------------------------------------------------------------------------------------------

function sharedProngRow(ctx: BandCtx, cov: Coverage, z: ZFn | undefined, scallop: boolean): Part[] {
  const { W, T, R } = dims(ctx);
  // widest stone whose prongs stay inside the band width
  let w = stoneWidth(ctx, W);
  for (let i = 0; i < 20 && w / 2 + prongR(w) * 0.6 > W / 2 - 0.02; i++) w *= 0.95;
  const gap = num(ctx.params, 'gapMm', 0.12, 0.05, 1.5);
  const rTop = R + T;
  const probe = accentStone(ctx, w);
  // girdle a little above the metal; keep the culet inside the metal
  const rg = Math.max(rTop + probe.built.crownHeight * 0.1, R + probe.built.pavilionDepth + 0.25);
  const arc = coverageArc(cov);
  // stone count math: a full circle shrinks the stones a touch so the row closes with even gaps
  const fit = fitStones(arc[0], arc[1], rg, probe.length, gap);
  const st = fit.size < probe.length - 1e-6 ? accentStone(ctx, (w * fit.size) / probe.length) : probe;
  const angles = fit.angles;
  const sw = st.width;
  const pr = prongR(sw);
  // the body is only as wide as the row needs: stones sit proud with prongs on the body edge
  const Wb = Math.min(W, sw + pr * 1.2);
  const body = seatSection(Wb, T, R);
  const full = cov === 'full';
  const dA = angles.length > 1 ? angles[1] - angles[0] : fit.pitch / rg;
  const prongAngles: number[] = angles.map((t) => t - dA / 2);
  if (!full && angles.length) prongAngles.push(angles[angles.length - 1] + dA / 2);
  const metal: THREE.BufferGeometry[] = [];
  if (scallop && angles.length) {
    // shared-prong look: the side walls dip in a U under every stone, showing its pavilion from the side
    const dip = Math.min(T * 0.45, st.built.pavilionDepth * 0.7);
    const first = prongAngles[0];
    const last = prongAngles[prongAngles.length - 1];
    const n = 16;
    metal.push(
      sweep({
        segments: segs(Math.min(900, Math.max(160, angles.length * 14)), z),
        zOffset: z,
        smoothProfile: true,
        profile: (theta) => {
          let phase = (theta - first) / dA;
          if (full) phase = ((phase % 1) + 1) % 1;
          const inside = full || (theta >= first && theta <= last);
          const f = inside ? Math.sin(Math.PI * clamp(phase - Math.floor(phase), 0, 1)) ** 0.7 : 0;
          const sec: Section = { W: Wb, bot: body.bot, top: (u) => body.top(u) - dip * f };
          return slicePoly(sec, -Wb / 2, Wb / 2, n);
        },
      }),
    );
  } else metal.push(sweepSection(body, { z }));
  const stones = instances(
    st.built.geometry,
    angles.map((t) => ringFrame(t, 0, rg, z)),
  );
  // each prong sits in the V between two round girdles and leans over both of them
  const zp = Math.min(Wb / 2 - pr * 0.6, (sw / 2) * 0.74);
  const tipR = rg + st.built.crownHeight * 0.45;
  for (const t of prongAngles)
    for (const u of [-zp, zp]) {
      const a = ringPt(t, u, rTop - 0.35, z);
      const b = ringPt(t, u * 0.93, tipR, z);
      metal.push(...rod(a, b, pr, pr * 0.85));
    }
  return parts(
    part('band-metal', metal, `${scallop ? 'shared-prong' : 'prong'} ${cov}`),
    part('band-stone', stones, 'eternity stones'),
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
      // bright-cut chamfer on the inside edge of each wall, as deep as the groove allows
      const e = Math.min(0.1, Math.max(0, s.top(inner) - fl) * 0.5);
      pts.push([half, s.top(half)]);
      pts.push([inner + e, s.top(inner + e)]);
      pts.push([inner, s.top(inner) - e]);
      pts.push([inner, Math.min(fl, s.top(inner) - e - 0.01)]);
      pts.push([-inner, Math.min(fl, s.top(-inner) - e - 0.01)]);
      pts.push([-inner, s.top(-inner) - e]);
      pts.push([-inner - e, s.top(-inner - e)]);
      pts.push([-half, s.top(-half)]);
      return pts;
    },
  });
  const gap = num(ctx.params, 'gapMm', 0.08, 0, 1);
  const fit = fitStones(arc[0], arc[1], rg, st.length, gap);
  if (fit.size < st.length - 1e-6) st = accentStone(ctx, (w * fit.size) / st.length);
  const angles = fit.angles;
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

/**
 * Profile of `s` with a bright-cut trough (half width g, bevel b, depth d) cut into the top.
 * CCW in (u, r): inner surface left -> right, then the outer surface right -> left with the trough and bevel
 * edges doubled so they stay crisp under smooth shading.
 */
function troughPoly(s: Section, g: number, b: number, d: number): ProfilePoint[] {
  const h = s.W / 2;
  const out: ProfilePoint[] = [];
  const nIn = 12;
  for (let i = 0; i < nIn; i++) {
    const u = -h * Math.cos((Math.PI * i) / (nIn - 1));
    out.push([u, s.bot(u)]);
  }
  const gg = Math.min(g, h - 0.2);
  const bb = Math.max(0.02, Math.min(b, h - gg - 0.1));
  const cut = (u: number) => {
    const x = Math.abs(u);
    if (x <= gg) return d;
    if (x >= gg + bb) return 0;
    return d * (1 - (x - gg) / bb);
  };
  const side: number[] = [h, h];
  for (let i = 1; i <= 5; i++) side.push(h - ((h - gg - bb) * i) / 5);
  const right = [...side, gg + bb, gg, gg, 0];
  const us = [
    ...right,
    ...right
      .slice(0, -1)
      .reverse()
      .map((u) => -u),
  ];
  for (const u of us) out.push([u, Math.max(s.bot(u) + 0.05, s.top(u) - cut(u))]);
  return out;
}

function paveRow(ctx: BandCtx, cov: Coverage, z: ZFn | undefined): Part[] {
  const { W, T, R } = dims(ctx);
  const rows = Math.round(num(ctx.params, 'rows', 1, 1, 3));
  const edge = bool(ctx.params, 'milgrainEdges', true);
  const rim = edge ? 0.5 : 0.3;
  const usable = W - 2 * rim;
  const gap = 0.08;
  let w = clamp(Math.min(stoneWidth(ctx, 2.2), usable / rows - gap), 0.8, 2.2);
  const s = makeSection(W, T, R, {
    dome: 0,
    innerDome: Math.min(T * 0.15, 0.25),
    corner: Math.min(0.25, T * 0.2),
    bevel: 0,
  });
  const rTop = s.top(0);
  const arc = coverageArc(cov);
  const probe = accentStone(ctx, w, 'round-brilliant');
  const rg0 = Math.max(rTop - probe.built.crownHeight * 0.7, R + probe.built.pavilionDepth + 0.15);
  const fit = fitStones(arc[0], arc[1], rg0, w, gap);
  if (fit.size < w - 1e-6) w = fit.size;
  const st = w === probe.length ? probe : accentStone(ctx, w, 'round-brilliant');
  const ch = st.built.crownHeight;
  const rg = Math.max(rTop - ch * 0.7, R + st.built.pavilionDepth + 0.15);
  // bright-cut trough the width of the stone rows
  const rowsW = rows * w + (rows - 1) * gap;
  const g = rowsW / 2 + 0.03;
  const bev = clamp(w * 0.22, 0.15, 0.3);
  const depth = Math.max(0, rTop - (rg - 0.05));
  const base = fit.angles;
  const dA = base.length > 1 ? base[1] - base[0] : fit.pitch / rg;
  const span: [number, number] =
    cov === 'full' ? arc : [base[0] - dA * 0.6, base[base.length - 1] + dA * 0.6];
  const body = sweep({
    segments: segs(cov === 'full' ? 160 : 220, z),
    zOffset: z,
    smoothProfile: true,
    profile: (theta) => troughPoly(s, g, bev, depth * arcMask(theta, span, 0.05)),
  });
  const rowU = Array.from({ length: rows }, (_, i) => (i - (rows - 1) / 2) * (w + gap));
  const stoneMats: THREE.Matrix4[] = [];
  const beadMats: THREE.Matrix4[] = [];
  const beadR = clamp(w * 0.19, 0.14, 0.32);
  const beadLift = ch * 0.3;
  rowU.forEach((u, ri) => {
    const off = ri % 2 === 1 ? dA / 2 : 0;
    for (const t of base) {
      if (off && cov !== 'full' && t + off > base[base.length - 1] + 1e-9) continue;
      stoneMats.push(ringFrame(t + off, u, rg, z));
    }
  });
  // shared beads: in every gap along each row, one pair holding the two neighbours; rows share their inner beads
  const beadU = new Set<number>();
  rowU.forEach((u) => {
    beadU.add(Math.round((u - (w / 2) * 0.78) * 1000) / 1000);
    beadU.add(Math.round((u + (w / 2) * 0.78) * 1000) / 1000);
  });
  const beadAngles =
    cov === 'full' ? base.map((t) => t + dA / 2) : [base[0] - dA / 2, ...base.map((t) => t + dA / 2)];
  for (const u of beadU) for (const t of beadAngles) beadMats.push(ringFrame(t, u, rg + beadLift, z));
  const metal: THREE.BufferGeometry[] = [body, ...instances(new THREE.SphereGeometry(beadR, 8, 6), beadMats)];
  if (edge) {
    const mb = 0.15;
    const ue = W / 2 - mb - 0.1;
    metal.push(...milgrainRow(s, -ue, mb, z), ...milgrainRow(s, ue, mb, z));
  }
  return parts(
    part('band-metal', metal, `pave ${cov}`),
    part('band-stone', instances(st.built.geometry, stoneMats), 'pave stones'),
  );
}

function row(ctx: BandCtx, defSetting: Setting, defCov: Coverage, scallopDefault = false): Part[] {
  const cov = str(ctx.params, 'coverage', COVERAGES, defCov);
  const setting = str(ctx.params, 'setting', SETTINGS, defSetting);
  const z = contourZ(ctx);
  if (setting === 'channel') return channelRow(ctx, cov, z);
  if (setting === 'bezel') return bezelRow(ctx, cov, z);
  return sharedProngRow(
    ctx,
    cov,
    z,
    bool(ctx.params, 'scallop', defSetting === 'shared-prong' && scallopDefault),
  );
}

registerBandBuilder('half-eternity', (ctx) => row(ctx, 'shared-prong', 'half'));
registerBandBuilder('three-quarter-eternity', (ctx) => row(ctx, 'shared-prong', 'three-quarter'));
registerBandBuilder('full-eternity', (ctx) => row(ctx, 'shared-prong', 'full'));
registerBandBuilder('shared-prong', (ctx) => row(ctx, 'shared-prong', 'half', true));
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
