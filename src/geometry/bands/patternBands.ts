/**
 * Patterned and two-tone bands: twisted-band, braided-band, vine-band, art-deco-band, mixed-metal-band, mens-inlay.
 */
import * as THREE from 'three';
import { registerBandBuilder } from '../builders';
import type { BandCtx, Part } from '../types';
import type { ProfilePoint } from '../helpers';
import { profileSection, PROFILE_KINDS } from './plainBands';
import {
  accentStone,
  bool,
  clamp,
  contourZ,
  cup,
  dims,
  fromTop,
  instances,
  makeSection,
  milgrainRow,
  num,
  part,
  parts,
  ringFrame,
  slicePoly,
  sphere,
  str,
  sweep,
  sweepSection,
  TAU,
  type Section,
  type ZFn,
} from './common';

/** Round wire whose centre wanders: u = uc(theta), r = rc(theta). */
function strand(
  uc: (t: number) => number,
  rc: (t: number) => number,
  rho: number,
  segments: number,
  z: ZFn | undefined,
  sides = 10,
): THREE.BufferGeometry {
  return sweep({
    segments,
    zOffset: z,
    smoothProfile: true,
    profile: (t) => {
      const cu = uc(t);
      const cr = rc(t);
      const pts: ProfilePoint[] = [];
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * TAU;
        pts.push([cu + rho * Math.cos(a), cr + rho * Math.sin(a)]);
      }
      return pts;
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Twisted rope (two strands)
// ---------------------------------------------------------------------------------------------

registerBandBuilder('twisted-band', (ctx) => {
  const { W, T, R } = dims(ctx);
  const z = contourZ(ctx);
  const rho = Math.min(W * 0.27, T * 0.36);
  const A = W / 2 - rho;
  const B = Math.max(0, T / 2 - rho);
  const rm = R + T / 2;
  const pitch = num(ctx.params, 'pitchMm', 4, 1.5, 12);
  const twists = Math.max(6, Math.round((TAU * rm) / pitch));
  const segments = Math.min(640, twists * 16);
  const geo = [0, 1].map((k) =>
    strand(
      (t) => A * Math.cos(twists * t + k * Math.PI),
      (t) => rm + B * Math.sin(twists * t + k * Math.PI),
      rho,
      segments,
      z,
    ),
  );
  if (bool(ctx.params, 'twoTone', false))
    return parts(part('band-metal', [geo[0]], 'strand A'), part('band-metal2', [geo[1]], 'strand B'));
  return parts(part('band-metal', geo, 'twisted rope'));
});

// ---------------------------------------------------------------------------------------------
// Braid (three strands, over-under)
// ---------------------------------------------------------------------------------------------

registerBandBuilder('braided-band', (ctx) => {
  const { W, T, R } = dims(ctx);
  const z = contourZ(ctx);
  const rho = Math.min(W * 0.17, T * 0.33);
  const A = W / 2 - rho;
  const B = Math.max(0.05, T / 2 - rho);
  const rm = R + T / 2;
  const pitch = num(ctx.params, 'pitchMm', 6, 2, 14);
  const cycles = Math.max(4, Math.round((TAU * rm) / pitch));
  const segments = Math.min(720, cycles * 24);
  const geo = [0, 1, 2].map((k) => {
    const ph = (k * TAU) / 3;
    return strand(
      (t) => A * Math.sin(cycles * t + ph),
      (t) => rm + B * Math.sin(2 * (cycles * t + ph)),
      rho,
      segments,
      z,
      8,
    );
  });
  if (bool(ctx.params, 'twoTone', false))
    return parts(
      part('band-metal', [geo[0], geo[2]], 'outer strands'),
      part('band-metal2', [geo[1]], 'middle strand'),
    );
  return parts(part('band-metal', geo, 'braid'));
});

// ---------------------------------------------------------------------------------------------
// Vine
// ---------------------------------------------------------------------------------------------

registerBandBuilder('vine-band', (ctx) => {
  const { W, T, R } = dims(ctx);
  const z = contourZ(ctx);
  const rw = clamp(W * 0.17, 0.3, 0.55);
  const baseT = Math.max(0.8, T - 1.6 * rw);
  const base = profileSection('half-round', Math.min(W * 0.45, 1.6), baseT, R, true);
  const A = W / 2 - rw * 1.1;
  const rc = R + T - rw;
  const waveLen = num(ctx.params, 'waveMm', 5, 2.5, 12);
  const waves = Math.max(4, Math.round((TAU * rc) / waveLen));
  const metal: THREE.BufferGeometry[] = [sweepSection(base, { z })];
  metal.push(
    strand(
      (t) => A * Math.sin(waves * t),
      () => rc,
      rw,
      Math.min(640, waves * 20),
      z,
      8,
    ),
  );
  // leaves just past each crest, angled away from the stem
  const Lh = Math.min(1.0, W * 0.22);
  const leaf = sphere(1, 1).scale(Lh, Math.max(0.12, rw * 0.45), Lh * 0.42);
  const leafMats: THREE.Matrix4[] = [];
  const budMats: THREE.Matrix4[] = [];
  const buds = bool(ctx.params, 'buds', true);
  const every = Math.round(num(ctx.params, 'leafEvery', 1, 1, 4));
  for (let j = 0; j < 2 * waves; j++) {
    const crest = ((j + 0.5) * Math.PI) / waves;
    const sign = Math.sin(waves * crest) > 0 ? 1 : -1;
    if (j % every === 0) {
      const t = crest + (0.35 * Math.PI) / waves;
      leafMats.push(ringFrame(t, A * Math.sin(waves * t), rc + rw * 0.2, z, sign * 0.9));
    }
    if (buds && Math.abs(fromTop(crest)) <= Math.PI / 2)
      budMats.push(ringFrame(crest, sign * A * 0.8, rc + rw * 0.55, z));
  }
  metal.push(...instances(leaf, leafMats));
  const out: (Part | null)[] = [];
  if (budMats.length > 0) {
    const w = clamp(Math.min(ctx.accent.sizeMm, 1.3, W * 0.4), 0.8, 1.3);
    const st = accentStone(ctx, w, 'round-brilliant');
    metal.push(
      ...instances(
        cup(Math.max(0.1, w / 2 - 0.06), w / 2 + 0.12, -rw, st.built.crownHeight * 0.25, 16),
        budMats,
      ),
    );
    out.push(part('band-stone', instances(st.built.geometry, budMats), 'vine buds'));
  }
  return parts(part('band-metal', metal, 'vine'), ...out);
});

// ---------------------------------------------------------------------------------------------
// Art deco: stepped profile, milgrain tiers, diamond-framed stations
// ---------------------------------------------------------------------------------------------

function steppedSection(W: number, T: number, R: number): { s: Section; poly: ProfilePoint[] } {
  const h = W / 2;
  const u1 = W * 0.17;
  const u2 = W * 0.33;
  const t1 = R + T;
  const t2 = R + T * 0.84;
  const t3 = R + T * 0.68;
  const inner = makeSection(W, T, R, { innerDome: Math.min(T * 0.15, 0.25), corner: 0.2 });
  const top = (u: number) => (Math.abs(u) <= u1 ? t1 : Math.abs(u) <= u2 ? t2 : t3);
  const poly: ProfilePoint[] = [];
  for (let i = 0; i < 9; i++) {
    const u = -h + (2 * h * i) / 8;
    poly.push([u, inner.bot(u)]);
  }
  const e = 0.04;
  const right: ProfilePoint[] = [
    [h, t3 - 0.1],
    [h - 0.1, t3],
    [u2 + e, t3],
    [u2, t2 - e],
    [u2 - e, t2],
    [u1 + e, t2],
    [u1, t1 - e],
    [u1 - e, t1],
  ];
  poly.push(...right);
  poly.push(
    ...right
      .slice()
      .reverse()
      .map(([u, r]) => [-u, r] as ProfilePoint),
  );
  return { s: { W, top, bot: inner.bot }, poly };
}

registerBandBuilder('art-deco-band', (ctx) => {
  const { W, T, R } = dims(ctx);
  const z = contourZ(ctx);
  const { s, poly } = steppedSection(W, T, R);
  const metal: THREE.BufferGeometry[] = [
    sweep({ segments: 160, zOffset: z, smoothProfile: false, profile: () => poly }),
  ];
  const mb = clamp(W * 0.035, 0.13, 0.22);
  if (bool(ctx.params, 'milgrain', true))
    for (const u of [-(W * 0.33 - mb - 0.05), W * 0.33 - mb - 0.05]) metal.push(...milgrainRow(s, u, mb, z));
  const out: (Part | null)[] = [];
  if (bool(ctx.params, 'stones', true)) {
    let w = clamp(ctx.accent.sizeMm, 0.8, W * 0.4);
    w = Math.min(w, Math.max(0.8, ((W / 2 - 0.05) / Math.SQRT2 - 0.25) * 2));
    const st = accentStone(ctx, w, 'round-brilliant');
    const ri = (w / 2) * Math.SQRT2;
    const ro = Math.min(W / 2 - 0.02, ri + 0.25 * Math.SQRT2);
    const rg = R + T + 0.08;
    const n = Math.round(num(ctx.params, 'stations', 5, 1, 11));
    const span = num(ctx.params, 'spreadDeg', 70, 10, 170) * (Math.PI / 180);
    const angles = Array.from(
      { length: n },
      (_, i) => Math.PI / 2 + (n === 1 ? 0 : -span / 2 + (span * i) / (n - 1)),
    );
    const mats = angles.map((t) => ringFrame(t, 0, rg, z));
    metal.push(
      ...instances(
        cup(Math.max(0.1, ri - 0.05), ro, -(rg - (R + T * 0.84)) - 0.05, st.built.crownHeight * 0.3, 4),
        mats,
      ),
    );
    out.push(part('band-stone', instances(st.built.geometry, mats), 'deco stations'));
  }
  return parts(part('band-metal', metal, 'art deco'), ...out);
});

// ---------------------------------------------------------------------------------------------
// Two-tone
// ---------------------------------------------------------------------------------------------

function sliceSweep(s: Section, uA: number, uB: number, z: ZFn | undefined, n = 12): THREE.BufferGeometry {
  return sweep({
    segments: z ? 192 : 128,
    zOffset: z,
    smoothProfile: true,
    profile: () => slicePoly(s, uA, uB, n),
  });
}

registerBandBuilder('mixed-metal-band', (ctx) => {
  const { W, T, R } = dims(ctx);
  const z = contourZ(ctx);
  const s = profileSection(str(ctx.params, 'profile', PROFILE_KINDS, 'comfort-dome'), W, T, R, true);
  const pattern = str(ctx.params, 'pattern', ['center-stripe', 'edges', 'halves'] as const, 'center-stripe');
  const h = W / 2;
  if (pattern === 'halves')
    return parts(
      part('band-metal', [sliceSweep(s, -h, 0, z)], 'half A'),
      part('band-metal2', [sliceSweep(s, 0, h, z)], 'half B'),
    );
  const a = (W * num(ctx.params, 'stripePct', 0.4, 0.15, 0.8)) / 2;
  const sides = [sliceSweep(s, -h, -a, z, 8), sliceSweep(s, a, h, z, 8)];
  const middle = [sliceSweep(s, -a, a, z, 10)];
  return pattern === 'edges'
    ? parts(part('band-metal', middle, 'centre'), part('band-metal2', sides, 'edges'))
    : parts(part('band-metal', sides, 'sides'), part('band-metal2', middle, 'stripe'));
});

registerBandBuilder('mens-inlay', (ctx: BandCtx) => {
  const { W, T, R } = dims(ctx);
  const z = contourZ(ctx);
  const s = profileSection(str(ctx.params, 'profile', PROFILE_KINDS, 'flat'), W, T, R, true);
  const a = (W * num(ctx.params, 'inlayPct', 0.5, 0.2, 0.8)) / 2;
  const depth = Math.min(num(ctx.params, 'inlayDepth', 0.6, 0.2, 1.2), T * 0.5);
  const h = W / 2;
  const baseSec: Section = { W, bot: s.bot, top: (u) => s.top(u) - depth };
  const inlaySec: Section = { W, bot: (u) => s.top(u) - depth, top: (u) => s.top(u) - 0.03 };
  return parts(
    part(
      'band-metal',
      [sliceSweep(s, -h, -a, z, 8), sliceSweep(s, a, h, z, 8), sliceSweep(baseSec, -a, a, z, 8)],
      'inlay body',
    ),
    part('band-metal2', [sliceSweep(inlaySec, -a, a, z, 8)], 'inlay'),
  );
});
