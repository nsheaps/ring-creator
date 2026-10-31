/** Shanks that carry accent stones: pave (beads) and channel (stones in a groove). */
import * as THREE from 'three';
import { registerShankBuilder } from '../builders';
import type { Part, ShankCtx, ShankResult } from '../types';
import type { ProfilePoint } from '../helpers';
import {
  TOP,
  accentDims,
  accentSize,
  beadGeometry,
  clamp,
  fromTop,
  headHalfAngle,
  instances,
  metal,
  num,
  outerExpFromRoundness,
  readTaper,
  ringFrame,
  smooth,
  spacedAngles,
  sweep,
  taperedBand,
  thickAt,
  widthAt,
} from './common';

/** Stone angles on both shoulders: from the edge of the head down to `coverage` of the half circumference. */
function stoneAngles(a0: number, a1: number, r: number, pitch: number): number[] {
  const one = spacedAngles(a0, a1, r, pitch);
  return [...one.map((a) => TOP - a), ...one.map((a) => TOP + a)];
}

function pave(ctx: ShankCtx): ShankResult {
  const p = ctx.params;
  const R = ctx.innerRadius;
  const tp = readTaper(p, { w: 2.2, wTop: 2.4, t: 1.8, tTop: 1.9, taperDeg: 60 });
  const outerExp = outerExpFromRoundness(num(p, 'roundness', 0.3, 0, 1));
  const band = taperedBand(R, tp, { outerExp, innerExp: 3, split: 0.55 });
  const coverage = num(p, 'coverage', 0.5, 0.1, 1);
  const minW = Math.min(tp.wBottom, tp.wTop);
  const size = accentSize(ctx, p, 0.8, Math.max(0.8, minW - 0.5));
  const dims = accentDims(ctx, size);
  const built = ctx.stone(ctx.accent.cut.id, dims, { detail: 'low' });
  const gapMm = num(p, 'stoneGapMm', 0.15, 0, 0.6);
  const rOut = R + tp.tBottom;
  const a0 = headHalfAngle(ctx, rOut) + 0.02;
  const a1 = Math.max(a0, coverage * Math.PI);
  const pitch = dims.length + gapMm;
  const angles = stoneAngles(a0, a1, rOut, pitch);
  const stoneMs: THREE.Matrix4[] = [];
  const beadMs: THREE.Matrix4[] = [];
  const beadR = clamp(size * 0.17, 0.14, 0.3);
  for (const th of angles) {
    const t = thickAt(tp, th);
    stoneMs.push(ringFrame(th, R + t - built.crownHeight * 0.55, 0));
    // four beads per stone, sitting at the stone's corners on the metal surface
    const dth = pitch / 2 / (R + t);
    for (const s of [-1, 1])
      for (const side of [-1, 1]) {
        const a = th + s * dth;
        const w = widthAt(tp, a);
        const z = side * clamp(dims.width / 2 + beadR * 0.2, 0, w / 2 - beadR * 0.6);
        beadMs.push(ringFrame(a, R + thickAt(tp, a) - beadR * 0.25, z));
      }
  }
  const parts: Part[] = [metal([band, instances(beadGeometry(beadR, 7, 5), beadMs)], 'pave shank')];
  if (stoneMs.length)
    parts.push({ slot: 'accent-stone', geometry: instances(built.geometry, stoneMs), label: 'pave stones' });
  return { parts, seatY: R + tp.tTop, topWidth: tp.wTop };
}
registerShankBuilder('pave', pave);

/** Channel section: a flat-topped band with a groove of half-width gw and depth gd cut into the top. */
function channelSection(R: number, w: number, t: number, gw: number, gd: number): ProfilePoint[] {
  const hw = w / 2;
  const c = Math.min(0.25, t * 0.15, hw * 0.2);
  const top = R + t;
  const g = Math.min(gw, hw - 0.35);
  return [
    [-hw + c, R],
    [hw - c, R],
    [hw, R + c],
    [hw, top - c],
    [hw - c, top],
    [g, top],
    [g, top - gd],
    [-g, top - gd],
    [-g, top],
    [-hw + c, top],
    [-hw, top - c],
    [-hw, R + c],
  ];
}

function channel(ctx: ShankCtx): ShankResult {
  const p = ctx.params;
  const R = ctx.innerRadius;
  const coverage = num(p, 'coverage', 0.5, 0.1, 1);
  const size0 = accentSize(ctx, p, 0.8, 3);
  const dims = accentDims(ctx, size0);
  const built = ctx.stone(ctx.accent.cut.id, dims, { detail: 'low' });
  const wallMm = num(p, 'wallMm', 0.45, 0.3, 1);
  const minWidth = dims.width + 2 * wallMm;
  const tp = readTaper(p, { w: 2.4, wTop: 2.6, t: 1.9, tTop: 2.0, taperDeg: 60 });
  tp.wBottom = Math.max(tp.wBottom, minWidth);
  tp.wTop = Math.max(tp.wTop, minWidth);
  const rOut = R + tp.tBottom;
  const hA = headHalfAngle(ctx, rOut);
  const zoneEnd = Math.max(hA + 0.1, coverage * Math.PI);
  const fade = 0.1;
  const gw = dims.width / 2 + 0.03;
  const depthFull = (t: number) => Math.min(built.crownHeight + 0.35, t - 0.6);
  const grooveAt = (th: number) => {
    const d = fromTop(th);
    return smooth((d - hA * 0.6) / fade) * smooth((zoneEnd - d) / fade);
  };
  const band = sweep({
    segments: 220,
    smoothProfile: false,
    profile: (th) => {
      const t = thickAt(tp, th);
      return channelSection(R, widthAt(tp, th), t, gw, Math.max(0, depthFull(t) * grooveAt(th)));
    },
  });
  const pitch = dims.length + 0.04;
  const angles = stoneAngles(hA + 0.02, zoneEnd - fade, rOut, pitch);
  const ms = angles.map((th) => ringFrame(th, R + thickAt(tp, th) - built.crownHeight - 0.04, 0));
  const parts: Part[] = [metal([band], 'channel shank')];
  if (ms.length)
    parts.push({ slot: 'accent-stone', geometry: instances(built.geometry, ms), label: 'channel stones' });
  return { parts, seatY: R + tp.tTop, topWidth: tp.wTop };
}
registerShankBuilder('channel', channel);
