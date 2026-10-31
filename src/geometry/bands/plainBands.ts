/**
 * Plain metal bands: plain-comfort, plain-flat, knife-edge, milgrain-band, contour-curved, chevron, notched,
 * stacker-trio, mens-classic, mens-hammered.
 */
import type * as THREE from 'three';
import { registerBandBuilder } from '../builders';
import type { BandCtx, Part } from '../types';
import {
  bool,
  bump,
  clamp,
  contourZ,
  dims,
  fromTop,
  hash2,
  makeSection,
  milgrainRow,
  num,
  part,
  parts,
  segs,
  slicePoly,
  smoothstep,
  str,
  sweep,
  sweepSection,
  TAU,
  type Section,
  type ZFn,
} from './common';

/** Section for a named profile. */
export type ProfileKind = 'comfort-dome' | 'flat' | 'beveled' | 'half-round' | 'knife';
export const PROFILE_KINDS = ['comfort-dome', 'flat', 'beveled', 'half-round', 'knife'] as const;

export function profileSection(
  kind: ProfileKind,
  W: number,
  T: number,
  R: number,
  comfortFit = true,
): Section {
  const innerDome = comfortFit ? Math.min(T * 0.18, W * 0.06) : 0;
  switch (kind) {
    case 'flat':
      // crisp flat top with a fine chamfer on each edge: reads as two bright lines along the band
      return makeSection(W, T, R, { dome: 0, innerDome, corner: 0.06, bevel: Math.min(0.18, W * 0.08) });
    case 'beveled':
      return makeSection(W, T, R, { dome: 0, innerDome, corner: 0.12, bevel: Math.min(W * 0.18, 1.2) });
    case 'half-round':
      return makeSection(W, T, R, {
        dome: T * 0.55,
        innerDome: innerDome * 0.5,
        corner: Math.min(T * 0.3, W * 0.3),
      });
    case 'knife':
      return makeSection(W, T, R, { dome: 0, innerDome, corner: 0.15, ridge: 0.5 });
    default:
      return makeSection(W, T, R, { dome: T * 0.32, innerDome, corner: Math.min(T * 0.4, W * 0.25) });
  }
}

function plain(kind: ProfileKind) {
  return (ctx: BandCtx): Part[] => {
    const { W, T, R } = dims(ctx);
    const comfort = bool(ctx.params, 'comfortFit', true);
    const k = str(ctx.params, 'profile', PROFILE_KINDS, kind);
    const s = profileSection(k, W, T, R, comfort);
    const z = contourZ(ctx);
    return parts(
      part(
        'band-metal',
        [
          sweepSection(s, {
            z,
            smooth: k !== 'knife' && k !== 'beveled' && k !== 'flat',
            n: k === 'flat' ? 20 : 14,
          }),
        ],
        `${k} band`,
      ),
    );
  };
}

registerBandBuilder('plain-comfort', plain('comfort-dome'));
registerBandBuilder('plain-flat', plain('flat'));
registerBandBuilder('knife-edge', plain('knife'));
registerBandBuilder('mens-classic', plain('comfort-dome'));

// ---------------------------------------------------------------------------------------------
// Milgrain
// ---------------------------------------------------------------------------------------------

registerBandBuilder('milgrain-band', (ctx) => {
  const { W, T, R } = dims(ctx);
  const k = str(ctx.params, 'profile', PROFILE_KINDS, 'flat');
  const s = profileSection(k, W, T, R, bool(ctx.params, 'comfortFit', true));
  const z = contourZ(ctx);
  const beadR = num(ctx.params, 'beadSize', 0.4, 0.2, 0.8) / 2;
  const inset = num(ctx.params, 'edgeInset', 0.25, 0, 1);
  const u = W / 2 - beadR - inset;
  const beads: THREE.BufferGeometry[] = [];
  const rows = str(ctx.params, 'rows', ['both', 'center', 'all'] as const, 'both');
  if (rows !== 'center') beads.push(...milgrainRow(s, -u, beadR, z), ...milgrainRow(s, u, beadR, z));
  if (rows !== 'both') beads.push(...milgrainRow(s, 0, beadR, z));
  return parts(part('band-metal', [sweepSection(s, { z }), ...beads], 'milgrain band'));
});

// ---------------------------------------------------------------------------------------------
// Curved / chevron / notched
// ---------------------------------------------------------------------------------------------

registerBandBuilder('contour-curved', (ctx) => {
  const { W, T, R } = dims(ctx);
  const s = profileSection(str(ctx.params, 'profile', PROFILE_KINDS, 'comfort-dome'), W, T, R, true);
  const z: ZFn =
    contourZ(ctx) ??
    ((t) =>
      num(ctx.params, 'curveRetreat', 2, 0.5, 6) * bump(t, num(ctx.params, 'curveHalfAngle', 0.6, 0.2, 1.4)));
  return parts(part('band-metal', [sweepSection(s, { z, segments: 220 })], 'curved band'));
});

/** Smoothed V: 1 at the top falling linearly to 0 at halfAngle, apex rounded by `round` radians. */
function vShape(theta: number, half: number, round: number): number {
  const d = fromTop(theta);
  const sAbs = Math.sqrt(d * d + round * round) - round;
  const lin = 1 - sAbs / (half - round * 0.5);
  // soft clamp to 0 at the legs' ends
  return lin <= 0 ? 0 : lin < 0.08 ? (lin * lin) / 0.16 + 0.0 : lin - 0.04;
}

registerBandBuilder('chevron', (ctx) => {
  const { W, T, R } = dims(ctx);
  const s = profileSection(str(ctx.params, 'profile', PROFILE_KINDS, 'comfort-dome'), W, T, R, true);
  const half = ctx.contour
    ? clamp(ctx.contour.halfAngle, 0.2, 1.2)
    : num(ctx.params, 'vHalfAngle', 0.45, 0.2, 1.2);
  const depth = ctx.contour ? ctx.contour.retreatMm : num(ctx.params, 'vDepth', 2, 0.5, 6);
  const dir = ctx.contour ? ctx.contour.direction : 1;
  const round = num(ctx.params, 'apexRound', 0.05, 0.01, 0.3);
  const z: ZFn = (t) => dir * depth * Math.max(0, vShape(t, half, round));
  return parts(part('band-metal', [sweepSection(s, { z, segments: 320 })], 'chevron band'));
});

registerBandBuilder('notched', (ctx) => {
  const { W, T, R } = dims(ctx);
  const s = profileSection(str(ctx.params, 'profile', PROFILE_KINDS, 'flat'), W, T, R, true);
  const pct = num(ctx.params, 'notchDepthPct', 0.45, 0.1, 0.7);
  const depth = ctx.contour ? clamp(ctx.contour.retreatMm, W * 0.2, W * 0.7) : W * pct;
  const half = ctx.contour
    ? clamp(ctx.contour.halfAngle * 0.6, 0.12, 0.8)
    : num(ctx.params, 'notchHalfAngle', 0.28, 0.1, 0.8);
  const curved = str(ctx.params, 'notchShape', ['square', 'curved'] as const, 'square') === 'curved';
  // the notch faces the engagement ring, which sits on the side opposite the contour direction (default -Z).
  const side = ctx.contour ? -ctx.contour.direction : -1;
  const ramp = Math.min(0.08, half * 0.4);
  const notch = (t: number) => {
    const d = Math.abs(fromTop(t));
    if (curved) return d >= half ? 0 : Math.sqrt(1 - (d / half) ** 2);
    return 1 - smoothstep(half - ramp, half, d);
  };
  const g = sweep({
    segments: 256,
    smoothProfile: true,
    profile: (t) => {
      const cut = depth * notch(t);
      return side < 0 ? slicePoly(s, -W / 2 + cut, W / 2, 14) : slicePoly(s, -W / 2, W / 2 - cut, 14);
    },
  });
  return parts(part('band-metal', [g], 'notched band'));
});

// ---------------------------------------------------------------------------------------------
// Stacker trio
// ---------------------------------------------------------------------------------------------

registerBandBuilder('stacker-trio', (ctx) => {
  const { W, T, R } = dims(ctx);
  // keep each band at least ~0.55 mm wide: shrink the gaps first on narrow bands
  const gap = Math.max(0.05, Math.min(num(ctx.params, 'gapMm', 0.25, 0.05, 0.8), (W - 1.65) / 2));
  const w = Math.max(0.4, (W - 2 * gap) / 3);
  const z = contourZ(ctx);
  const middle = str(ctx.params, 'middle', ['plain', 'milgrain', 'knife'] as const, 'milgrain');
  const twoTone = bool(ctx.params, 'twoTone', false);
  const outer: THREE.BufferGeometry[] = [];
  const mid: THREE.BufferGeometry[] = [];
  for (const k of [-1, 0, 1]) {
    const c = k * (w + gap);
    const s =
      k === 0 && middle === 'knife'
        ? profileSection('knife', w, T, R, true)
        : profileSection('half-round', w, T * (k === 0 ? 1 : 0.9), R, true);
    const g = sweep({
      segments: segs(128, z),
      smoothProfile: !(k === 0 && middle === 'knife'),
      zOffset: z,
      profile: () => slicePoly(s, -w / 2, w / 2, 12, c),
    });
    (k === 0 ? mid : outer).push(g);
    if (k === 0 && middle === 'milgrain') {
      const beadR = clamp(w * 0.22, 0.15, 0.35);
      const shifted: Section = { W: w, top: (u) => s.top(u - c), bot: (u) => s.bot(u - c) };
      mid.push(...milgrainRow(shifted, c, beadR, z));
    }
  }
  if (twoTone)
    return parts(part('band-metal', outer, 'outer stackers'), part('band-metal2', mid, 'middle stacker'));
  return parts(part('band-metal', [...outer, ...mid], 'stacker trio'));
});

// ---------------------------------------------------------------------------------------------
// Hammered (men's)
// ---------------------------------------------------------------------------------------------

/** Dimple field: shallow spherical dents on a jittered grid (deterministic), periodic every `period` cells along the band. Returns 0..1. */
function dimple(arcMm: number, u: number, cell: number, period: number, seed: number): number {
  const gi = Math.floor(arcMm / cell);
  const gj = Math.floor(u / cell);
  let best = Infinity;
  for (let di = -1; di <= 1; di++)
    for (let dj = -1; dj <= 1; dj++) {
      const i = gi + di;
      const j = gj + dj;
      const iw = ((i % period) + period) % period;
      const cx = (i + 0.2 + 0.6 * hash2(iw, j, seed)) * cell;
      const cy = (j + 0.2 + 0.6 * hash2(j, iw, seed + 7)) * cell;
      const d = Math.hypot(arcMm - cx, u - cy);
      if (d < best) best = d;
    }
  const t = Math.min(1, best / (cell * 0.75));
  return 1 - t * t;
}

registerBandBuilder('mens-hammered', (ctx) => {
  const { W, T, R } = dims(ctx);
  const base = profileSection(str(ctx.params, 'profile', PROFILE_KINDS, 'comfort-dome'), W, T, R, true);
  const cell = num(ctx.params, 'dentSize', 1.6, 0.6, 4);
  const depth = num(ctx.params, 'dentDepth', 0.12, 0, 0.35);
  const seed = Math.round(num(ctx.params, 'seed', 1, 0, 999));
  const z = contourZ(ctx);
  const rTop = R + T;
  const circ = TAU * rTop;
  // the cell count around must be whole so the pattern wraps without a seam
  const cellsAround = Math.max(8, Math.round(circ / cell));
  const cellA = circ / cellsAround;
  const segments = Math.min(420, cellsAround * 7);
  const n = 20;
  const g = sweep({
    segments,
    zOffset: z,
    smoothProfile: true,
    profile: (theta) => {
      const arc = ((((theta % TAU) + TAU) % TAU) / TAU) * circ;
      const s: Section = {
        W,
        bot: base.bot,
        top: (u) => {
          const edge = 1 - smoothstep(W / 2 - 0.5, W / 2 - 0.1, Math.abs(u));
          return base.top(u) - depth * edge * dimple(arc, u, cellA, cellsAround, seed);
        },
      };
      return slicePoly(s, -W / 2, W / 2, n);
    },
  });
  // hammered metal reads as facets: flat normals
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  return parts(part('band-metal', [g], 'hammered band'));
});
