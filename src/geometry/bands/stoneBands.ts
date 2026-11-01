/**
 * Stone-set bands: half-eternity, three-quarter-eternity, full-eternity, shared-prong, channel-band, pave-band, bezel-band.
 * Stones are the band's accent stone (ctx.accent), built with detail 'low' and merged into one 'band-stone' part.
 */
import * as THREE from 'three';
import { registerBandBuilder } from '../builders';
import { fitStones, type ProfilePoint } from '../helpers';
import type { BandCtx, BuiltStone, Part } from '../types';
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
  rod,
  segs,
  slicePoly,
  stations,
  str,
  sweep,
  sweepSection,
  type Coverage,
  TAU,
  TOP,
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

export const SIZE_PROFILES = ['uniform', 'graduated'] as const;

/** True when every other stone is another gem (param `alternate` = a gem id). */
function alternating(ctx: BandCtx): boolean {
  const a = ctx.params.alternate;
  return typeof a === 'string' && a !== '' && a !== 'none';
}

/** One stone of a graduated or pathed row. */
interface Slot {
  t: number;
  /** across the band */
  w: number;
  /** along the band */
  len: number;
}

/** Cumulative path length (mm) along the band's centre line over [a0, a1]; the path bends sideways with `z`. */
function pathTable(a0: number, a1: number, r: number, z: ZFn | undefined, n = 1200) {
  const ts: number[] = [];
  const ss: number[] = [0];
  const step = (a1 - a0) / n;
  for (let i = 0; i <= n; i++) ts.push(a0 + step * i);
  for (let i = 1; i <= n; i++) {
    const dz = z ? z(ts[i]) - z(ts[i - 1]) : 0;
    ss.push(ss[i - 1] + Math.hypot(r * Math.abs(step), dz));
  }
  const total = ss[n];
  const toT = (s: number): number => {
    const c = clamp(s, 0, total);
    let lo = 0;
    let hi = n;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (ss[m] <= c) lo = m;
      else hi = m;
    }
    const f = (c - ss[lo]) / Math.max(1e-9, ss[hi] - ss[lo]);
    return ts[lo] + (ts[hi] - ts[lo]) * f;
  };
  const toS = (t: number): number => {
    const f = clamp((t - a0) / (a1 - a0), 0, 1) * n;
    const i = Math.min(n - 1, Math.floor(f));
    return ss[i] + (ss[i + 1] - ss[i]) * (f - i);
  };
  return { total, toT, toS };
}

/**
 * Stones laid from the middle of the arc outwards: a stone sits at the middle (the apex of a V, the top of the ring)
 * and each next one is smaller by `sizeAt(d)`, d = 0 in the middle and 1 at the ends. Open arcs keep the exact gap
 * and are centred; a full circle stretches the gaps a little so the row closes.
 */
function graduatedSlots(
  ctx: BandCtx,
  arc: [number, number],
  r: number,
  z: ZFn | undefined,
  sizeAt: (d: number) => number,
  gap: number,
  maxCount = 0,
): Slot[] {
  const aspect = clamp(ctx.accent.cut.defaultAspect, 1, 3);
  const tab = pathTable(arc[0], arc[1], r, z);
  const S = tab.total;
  const full = Math.abs(arc[1] - arc[0] - TAU) < 1e-6;
  const q = (w: number) => Math.round(w * 20) / 20;
  const sideMax = maxCount > 0 ? Math.max(0, Math.floor((maxCount - 1) / 2)) : 80;
  let half = S / 2;
  let offs: { o: number; w: number; len: number }[] = [];
  // with a fixed count the sizes shrink to the end stone at the last one, so the span is found by iterating
  for (let pass = 0; pass < (maxCount > 0 ? 4 : 1); pass++) {
    const lenOf = (d: number) => q(sizeAt(clamp(d, 0, 1))) * aspect;
    const w0 = q(sizeAt(0));
    offs = [{ o: 0, w: w0, len: w0 * aspect }];
    let prev = offs[0];
    for (let k = 0; k < sideMax; k++) {
      let len = prev.len;
      let o = prev.o + prev.len / 2 + gap + len / 2;
      for (let i = 0; i < 3; i++) {
        len = lenOf(o / half);
        o = prev.o + prev.len / 2 + gap + len / 2;
      }
      if (o + len / 2 > S / 2 + 1e-6 || len < 0.5) break;
      prev = { o, w: q(sizeAt(clamp(o / half, 0, 1))), len };
      offs.push(prev);
    }
    if (maxCount <= 0) break;
    half = prev.o || half;
  }
  if (full && offs.length > 1 && maxCount <= 0) {
    const last = offs[offs.length - 1];
    const k = (S / 2 - gap / 2 - last.len / 2) / last.o;
    for (const e of offs) e.o *= k;
  }
  const out: Slot[] = [];
  const mid = S / 2;
  for (const e of offs) {
    if (e.o > 0) out.unshift({ t: tab.toT(mid - e.o), w: e.w, len: e.len });
    if (e.o === 0) out.push({ t: tab.toT(mid), w: e.w, len: e.len });
  }
  for (const e of offs) if (e.o > 0) out.push({ t: tab.toT(mid + e.o), w: e.w, len: e.len });
  return out;
}

/** Arc over which a bodyless row of stones follows a bent (contour / chevron) band. */
export function bendArc(half: number): [number, number] {
  return [TOP - half, TOP + half];
}

export interface RowOpts {
  /** Stones only: the metal is supplied by the caller (contour and chevron bands). */
  bodyless?: boolean;
  /** Override the arc (default: the coverage arc). */
  arc?: [number, number];
}

function sharedProngRow(
  ctx: BandCtx,
  cov: Coverage,
  z: ZFn | undefined,
  scallop: boolean,
  o: RowOpts = {},
): Part[] {
  const { W, T, R } = dims(ctx);
  const raise = num(ctx.params, 'raise', 0, 0, 3);
  const graduated = str(ctx.params, 'sizeProfile', SIZE_PROFILES, 'uniform') === 'graduated' || !!o.bodyless;
  const endScale = num(ctx.params, 'endScale', 0.6, 0.3, 1);
  // widest stone whose prongs stay inside the band width, unless the setting is raised (then stones may overhang)
  let w = stoneWidth(ctx, raise > 0 ? 8 : W);
  if (raise <= 0 && !o.bodyless)
    for (let i = 0; i < 20 && w / 2 + prongR(w) * 0.6 > W / 2 - 0.02; i++) w *= 0.95;
  const gap = num(ctx.params, 'gapMm', 0.12, 0.05, 1.5);
  const rTop = R + T;
  const arc = o.arc ?? coverageArc(cov);
  const probe = accentStone(ctx, w);
  const rgOf = (st: { built: BuiltStone }) =>
    Math.max(rTop + st.built.crownHeight * 0.1, R + st.built.pavilionDepth + 0.25) + raise;
  const rg0 = rgOf(probe);
  const full = cov === 'full' && !o.arc;
  interface Placed {
    t: number;
    st: ReturnType<typeof accentStone>;
    rg: number;
  }
  let placed: Placed[];
  let prongAt: number[];
  let prongW: number[];
  if (graduated) {
    const slots = graduatedSlots(
      ctx,
      arc,
      rg0,
      z,
      (d) => w * (endScale + (1 - endScale) * (1 - d)),
      gap,
      Math.round(num(ctx.params, 'stoneCount', 0, 0, 40)),
    );
    placed = slots.map((s) => {
      const st = accentStone(ctx, s.w);
      return { t: s.t, st, rg: rgOf(st) };
    });
    const tab = pathTable(arc[0], arc[1], rg0, z);
    prongAt = [];
    prongW = [];
    for (let i = 0; i + 1 < slots.length; i++) {
      const a = tab.toS(slots[i].t) + slots[i].len / 2;
      const b = tab.toS(slots[i + 1].t) - slots[i + 1].len / 2;
      prongAt.push(tab.toT((a + b) / 2));
      prongW.push(Math.min(slots[i].w, slots[i + 1].w));
    }
    if (full && slots.length > 1) {
      const a = tab.toS(slots[slots.length - 1].t) + slots[slots.length - 1].len / 2;
      const b = tab.toS(slots[0].t) - slots[0].len / 2 + tab.total;
      prongAt.push(tab.toT(((a + b) / 2) % tab.total));
      prongW.push(Math.min(slots[0].w, slots[slots.length - 1].w));
    } else if (!full && slots.length) {
      for (const [sl, sign] of [
        [slots[0], -1],
        [slots[slots.length - 1], 1],
      ] as const) {
        const sS = tab.toS(sl.t) + (sign * (sl.len + gap)) / 2;
        prongAt.push(tab.toT(sS));
        prongW.push(sl.w);
      }
    }
  } else {
    // stone count math: a full circle shrinks the stones a touch so the row closes with even gaps
    let fit = fitStones(arc[0], arc[1], rg0, probe.length, gap);
    // alternating stones need an even count to close a full circle
    if (full && alternating(ctx) && fit.count % 2 === 1)
      fit = fitStones(arc[0], arc[1], rg0, (TAU * rg0) / (fit.count + 1) - gap + 1e-3, gap);
    const st = fit.size < probe.length - 1e-6 ? accentStone(ctx, (w * fit.size) / probe.length) : probe;
    const dA = fit.angles.length > 1 ? fit.angles[1] - fit.angles[0] : fit.pitch / rg0;
    let angles = fit.angles;
    const want = Math.round(num(ctx.params, 'stoneCount', 0, 0, 40));
    if (want > 0 && !full && want < angles.length) {
      const drop = Math.floor((angles.length - want) / 2);
      angles = angles.slice(drop, drop + want);
    }
    placed = angles.map((t) => ({ t, st, rg: rg0 }));
    prongAt = angles.map((t) => t - dA / 2);
    if (!full && angles.length) prongAt.push(angles[angles.length - 1] + dA / 2);
    prongW = prongAt.map(() => st.width);
  }
  prongAt.sort((a, b) => a - b);
  const maxW = placed.reduce((m, p) => Math.max(m, p.st.width), 0.8);
  const pr = prongR(maxW);
  // the body is only as wide as the row needs: stones sit proud with prongs on the body edge
  const Wb = Math.min(W, maxW + pr * 1.2);
  const body = seatSection(Wb, T, R);
  const metal: THREE.BufferGeometry[] = [];
  if (!o.bodyless) {
    if (scallop && placed.length && !graduated) {
      // shared-prong look: the side walls dip in a U under every stone, showing its pavilion from the side
      const st0 = placed[0].st;
      const dA = placed.length > 1 ? placed[1].t - placed[0].t : st0.length / rg0;
      const dip = Math.min(T * 0.45, st0.built.pavilionDepth * 0.7);
      const first = prongAt[0];
      const last = prongAt[prongAt.length - 1];
      const n = 16;
      metal.push(
        sweep({
          segments: segs(Math.min(900, Math.max(160, placed.length * 14)), z),
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
  }
  const dz = (t: number, rg: number) => (z ? (z(t + 1e-3) - z(t - 1e-3)) / 2e-3 / rg : 0);
  const spinAt = (t: number, rg: number) => Math.atan(dz(t, rg));
  const stones: THREE.BufferGeometry[] = [];
  const stones2: THREE.BufferGeometry[] = [];
  const alt = alternating(ctx);
  placed.forEach((p, i) =>
    (alt && i % 2 === 1 ? stones2 : stones).push(
      ...instances(p.st.built.geometry, [ringFrame(p.t, 0, p.rg, z, spinAt(p.t, p.rg))]),
    ),
  );
  // each prong sits in the V between two round girdles and leans over both of them
  prongAt.forEach((t, i) => {
    const sw = prongW[i] ?? maxW;
    const prad = prongR(sw);
    const near = placed.reduce((b, p) => (Math.abs(p.t - t) < Math.abs(b.t - t) ? p : b), placed[0]);
    const rgm = near.rg;
    const m = ringFrame(t, 0, rgm, z, spinAt(t, rgm));
    const baseU = Math.min(Wb / 2 - prad * 0.6, (sw / 2) * 0.74);
    const tipU = (sw / 2) * 0.74;
    const baseY = rTop - 0.35 - rgm;
    const tipY = near.st.built.crownHeight * 0.45;
    for (const sg of [-1, 1])
      metal.push(
        ...rod(
          new THREE.Vector3(0, baseY, sg * baseU).applyMatrix4(m),
          new THREE.Vector3(0, tipY, sg * tipU * 0.93).applyMatrix4(m),
          prad,
          prad * 0.85,
        ),
      );
  });
  return parts(
    part('band-metal', metal, `${scallop ? 'shared-prong' : 'prong'} ${cov}`),
    part('band-stone', stones, 'eternity stones'),
    alt ? part('band-stone2', stones2, 'alternate stones') : null,
  );
}

/** Bodyless prong stones that follow a contour or chevron band over the bend. */
export function bentRow(ctx: BandCtx, z: ZFn, half: number): Part[] {
  const spread = num(ctx.params, 'stoneSpread', 1, 0.4, 3);
  return sharedProngRow(ctx, 'half', z, false, {
    bodyless: true,
    arc: bendArc(clamp(half * spread, 0.1, 1.5)),
  });
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
  let fit = fitStones(arc[0], arc[1], rg, st.length, gap);
  if (cov === 'full' && alternating(ctx) && fit.count % 2 === 1)
    fit = fitStones(arc[0], arc[1], rg, (TAU * rg) / (fit.count + 1) - gap + 1e-3, gap);
  if (fit.size < st.length - 1e-6) st = accentStone(ctx, (w * fit.size) / st.length);
  const angles = fit.angles;
  const alt = alternating(ctx);
  const mats = angles.map((t) => ringFrame(t, 0, rg, z));
  const stones = instances(
    st.built.geometry,
    mats.filter((_, i) => !alt || i % 2 === 0),
  );
  const stones2 = alt
    ? instances(
        st.built.geometry,
        mats.filter((_, i) => i % 2 === 1),
      )
    : [];
  return parts(
    part('band-metal', [g], `channel ${cov}`),
    part('band-stone', stones, 'channel stones'),
    alt ? part('band-stone2', stones2, 'alternate stones') : null,
  );
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
