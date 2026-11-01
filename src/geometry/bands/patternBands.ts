/**
 * Patterned and two-tone bands: twisted-band, braided-band, vine-band, art-deco-band, mixed-metal-band, mens-inlay.
 */
import * as THREE from 'three';
import { registerBandBuilder } from '../builders';
import type { BandCtx, Part } from '../types';
import {
  braidStrands,
  curveFrom,
  ropeStrands,
  surfaceLeaf,
  surfaceMapFrom,
  surfaceWire,
  type ProfilePoint,
} from '../helpers';
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
  outward,
  part,
  parts,
  ringFrame,
  segs,
  slicePoly,
  smoothstep,
  str,
  sweep,
  sweepSection,
  TAU,
  TOP,
  type Section,
  type ZFn,
} from './common';
import { finish } from '../shanks/common';

// ---------------------------------------------------------------------------------------------
// Twisted rope (two round wires wound around each other) and braid (three flat ribbons plaited)
// ---------------------------------------------------------------------------------------------

registerBandBuilder('twisted-band', (ctx) => {
  const { W, T, R } = dims(ctx);
  const z = contourZ(ctx);
  const pitch = num(ctx.params, 'pitchMm', 4, 1.5, 12);
  const turns = Math.max(6, Math.round((TAU * (R + T / 2)) / pitch));
  const geo = ropeStrands({ R, W, T, strands: 2, turns, z, wire: 1.1, budget: 40000 }).map((g) => outward(g));
  if (bool(ctx.params, 'twoTone', false))
    return parts(part('band-metal', [geo[0]], 'strand A'), part('band-metal2', [geo[1]], 'strand B'));
  return parts(part('band-metal', geo, 'twisted rope'));
});

registerBandBuilder('braided-band', (ctx) => {
  const { W, T, R } = dims(ctx);
  const z = contourZ(ctx);
  const pitch = num(ctx.params, 'pitchMm', 6, 2, 14);
  const cycles = Math.max(4, Math.round((TAU * (R + T / 2)) / pitch));
  const geo = braidStrands({ R, W, T, cycles, ribbon: W * 0.5, z, budget: 40000 }).map((g) => outward(g));
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
  // a softly domed band carries the vine: a raised stem weaving across the top with leaves lying flat on the metal
  const base = profileSection('half-round', W, T * 0.85, R, true);
  const metal: THREE.BufferGeometry[] = [sweepSection(base, { z })];
  const rRef = R + T * 0.85;
  const pts: ProfilePoint[] = [];
  for (let i = 0; i <= 48; i++) {
    const u = W / 2 - (W * i) / 48;
    pts.push([u, base.top(u)]);
  }
  const curve = curveFrom(pts);
  const map = surfaceMapFrom(() => curve, rRef, z);
  const rw = clamp(W * 0.07, 0.14, 0.24);
  const A = Math.min(W * 0.22, curve.mid - rw * 3);
  const waveLen = num(ctx.params, 'waveMm', 5, 2.5, 12);
  const circ = TAU * rRef;
  const waves = Math.max(4, Math.round(circ / waveLen));
  const k = (TAU * waves) / circ;
  const lam = (s: number) => A * Math.sin(k * s);
  metal.push(
    finish(
      surfaceWire(
        map,
        (f) => {
          const s = -circ / 2 + circ * f;
          return [s, lam(s)];
        },
        Math.min(900, waves * 40),
        () => rw,
        0.08,
        8,
      ),
    ),
  );
  // leaves just past each crest, lying along the surface and pointing out of the bend
  const every = Math.round(num(ctx.params, 'leafEvery', 1, 1, 4));
  const leafLen = clamp(W * 0.42, 1.0, 2.2);
  const budMats: THREE.Matrix4[] = [];
  const buds = bool(ctx.params, 'buds', true);
  const budW = clamp(Math.min(ctx.accent.sizeMm, 1.3, W * 0.32), 0.8, 1.3);
  for (let j = 0; j < 2 * waves; j++) {
    const sc = -circ / 2 + ((j + 0.5) * circ) / (2 * waves);
    const sign = Math.sign(Math.sin(k * sc)) || 1;
    if (j % every === 0) {
      const s0 = sc + (0.12 * circ) / (2 * waves);
      const slope = A * k * Math.cos(k * s0);
      const ang = Math.atan(slope) - sign * 0.75;
      metal.push(
        finish(
          surfaceLeaf(map, {
            s: s0,
            lambda: lam(s0),
            angle: ang,
            length: leafLen,
            width: leafLen * 0.45,
            thick: clamp(leafLen * 0.14, 0.18, 0.3),
            curl: -sign * 0.06,
          }),
        ),
      );
    }
    const theta = TOP + sc / rRef;
    // buds sit in the hollow of each bend on the top half of the band
    if (buds && Math.abs(fromTop(theta)) <= Math.PI / 2) {
      const u = sign * (A - budW * 0.7);
      budMats.push(ringFrame(theta, u, base.top(u), z));
    }
  }
  const out: (Part | null)[] = [];
  if (budMats.length > 0) {
    const st = accentStone(ctx, budW, 'round-brilliant');
    metal.push(
      ...instances(
        cup(Math.max(0.1, budW / 2 - 0.06), budW / 2 + 0.12, -0.25, st.built.crownHeight * 0.25, 16),
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

// ---------------------------------------------------------------------------------------------
// Bamboo: a half-round band with raised nodes, optionally each node carrying a bezel-set stone
// ---------------------------------------------------------------------------------------------

registerBandBuilder('bamboo-band', (ctx: BandCtx) => {
  const { W, T, R } = dims(ctx);
  const z = contourZ(ctx);
  const kind = str(ctx.params, 'profile', ['half-round', 'comfort-dome'] as const, 'half-round');
  const nodes = Math.round(num(ctx.params, 'nodes', 9, 4, 18));
  const slim = num(ctx.params, 'slim', 0.18, 0, 0.4);
  const withStones = bool(ctx.params, 'stones', false);
  const rMid = R + T / 2;
  const ws = clamp(num(ctx.params, 'stoneSize', 0, 0, 6) || ctx.accent.sizeMm, 0.8, W * 0.8);
  const pitch = (TAU * rMid) / nodes;
  const nodeW = clamp(withStones ? ws + 0.7 : num(ctx.params, 'nodeWidth', 1.4, 0.6, 4), 0.6, pitch * 0.7);
  const ramp = Math.min(0.9, (pitch - nodeW) * 0.3);
  const nodeAngle = (k: number) => TOP + (k * TAU) / nodes;
  // 1 on a node, 0 between nodes; the ramp is the little shoulder of the knuckle
  const q = (theta: number): number => {
    const step = TAU / nodes;
    const x = (((theta - TOP) % step) + step) % step;
    const d = Math.min(x, step - x) * rMid;
    return 1 - smoothstep(nodeW / 2, nodeW / 2 + ramp, d);
  };
  const secAt = (theta: number): Section => {
    const f = 1 - slim * (1 - q(theta));
    return profileSection(kind, W * f, T * (1 - slim * 0.5 * (1 - q(theta))), R, true);
  };
  const body = sweep({
    segments: segs(Math.min(520, Math.max(220, nodes * 30)), z),
    zOffset: z,
    smoothProfile: true,
    profile: (theta) => {
      const s = secAt(theta);
      return slicePoly(s, -s.W / 2, s.W / 2, 12);
    },
  });
  const metal: THREE.BufferGeometry[] = [body];
  const stones: THREE.BufferGeometry[] = [];
  if (withStones) {
    const cov = str(ctx.params, 'coverage', ['half', 'three-quarter', 'full'] as const, 'half');
    const limit =
      cov === 'full' ? Math.PI + 1e-6 : cov === 'half' ? Math.PI / 2 + 1e-6 : Math.PI * 0.75 + 1e-6;
    const st = accentStone(ctx, ws);
    const rTop = R + T;
    const rg = rTop - st.built.crownHeight * 0.08;
    const collar = cup(Math.max(0.1, ws / 2 - 0.08), ws / 2 + 0.26, -0.3, st.built.crownHeight * 0.3, 16);
    for (let k = 0; k < nodes; k++) {
      const t = nodeAngle(k);
      if (Math.abs(fromTop(t)) > limit) continue;
      const m = ringFrame(t, 0, rg, z);
      metal.push(...instances(collar, [m]));
      stones.push(...instances(st.built.geometry, [m]));
    }
  }
  return parts(part('band-metal', metal, 'bamboo'), part('band-stone', stones, 'node stones'));
});
