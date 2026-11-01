/**
 * Swept tension blades (the tension-bypass head): each end of the band lifts off the shoulder in a low, smooth swoop
 * and wraps round one side of the stone like a ribbon, its inner edge biting the girdle. The two blades are point
 * symmetric: the one from the +band side wraps the +across side of the stone, the other the opposite side, so they
 * pass each other like a bypass and hold the stone between them across the finger.
 */
import * as THREE from 'three';
import { registerHeadBuilder } from '../builders';
import type { HeadCtx, Part } from '../types';
import { loftRows, toFlat } from '../helpers';
import { cleanOutline, metalPart, num, ringDrop, shankTopRadius, signedVolume, v3 } from './common';
import { radialPoint } from './frameOutline';

/** Smooth 0..1 ramp. */
const smooth = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** One sample of a blade's centre line in band coordinates (u along the band, v across the finger). */
interface BladeSample {
  u: number;
  v: number;
  /** top and bottom of the ribbon (stone-frame y) */
  top: number;
  bottom: number;
  /** half width of the ribbon */
  hw: number;
}

/** Points of a rounded-rectangle (superellipse) section, counter-clockwise in (lateral, vertical). */
function sectionShape(m: number, n: number): [number, number][] {
  return Array.from({ length: m }, (_, i) => {
    const a = (i / m) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [Math.sign(c) * Math.abs(c) ** (2 / n), Math.sign(s) * Math.abs(s) ** (2 / n)];
  });
}

/** Closed smooth-shaded solid from blade samples (indexed loft, outward winding, smooth normals). */
function ribbon(
  samples: BladeSample[],
  toStone: (u: number, v: number) => [number, number],
): THREE.BufferGeometry {
  const shape = sectionShape(22, 2.8);
  const rows: THREE.Vector3[][] = samples.map((p, i) => {
    const a = samples[Math.max(0, i - 1)];
    const b = samples[Math.min(samples.length - 1, i + 1)];
    const [ax, az] = toStone(a.u, a.v);
    const [bx, bz] = toStone(b.u, b.v);
    // 3D tangent of the centre line; the section is built square to it so a steep swoop keeps its full depth
    const t = v3(bx - ax, (b.top + b.bottom - a.top - a.bottom) / 2, bz - az);
    if (t.lengthSq() < 1e-12) t.set(1, 0, 0);
    t.normalize();
    const lat = v3(-t.z, 0, t.x);
    if (lat.lengthSq() < 1e-9) lat.set(1, 0, 0);
    lat.normalize();
    const up = lat.clone().cross(t).normalize();
    if (up.y < 0) up.negate();
    const [cx, cz] = toStone(p.u, p.v);
    const c = v3(cx, (p.top + p.bottom) / 2, cz);
    const hh = Math.max(0.02, (p.top - p.bottom) / 2);
    return shape.map(([sx, sy]) => {
      // a slightly domed top: the upper half is fuller than the lower one
      const k = sy * hh * (sy > 0 ? 1 : 0.92);
      return c
        .clone()
        .addScaledVector(lat, sx * p.hw)
        .addScaledVector(up, k);
    });
  });
  const g = loftRows(rows);
  if (signedVolume(g) < 0) {
    const idx = g.getIndex();
    if (idx) {
      const arr = idx.array as Uint16Array | Uint32Array;
      for (let k = 0; k + 2 < arr.length; k += 3) {
        const t = arr[k + 1];
        arr[k + 1] = arr[k + 2];
        arr[k + 2] = t;
      }
      idx.needsUpdate = true;
    }
  }
  g.computeVertexNormals();
  return toFlat(g);
}

/**
 * Tension-bypass: two swept ribbon blades. Params: `bladeWidth` (ribbon width where it holds the stone),
 * `jawThickness` (ribbon depth at the stone; it thins towards the tip), `sweepOffset` (how far off the centre line
 * each blade meets the shank, to line up with a bypass shank's ends), `sweepRun` (length of the swoop from the stone
 * down to the shank), `wrap` (degrees each blade wraps round the stone past its middle) and `bite` (groove depth).
 */
function sweptBlades(ctx: HeadCtx): Part[] {
  const p = ctx.params;
  const o = cleanOutline(ctx.center.built.outline);
  const built = ctx.center.built;
  const g2 = Math.max(0, built.girdleThickness) * 0.5;
  const W = num(p, 'bladeWidth', 2.2, 1.2, 5);
  const T = num(p, 'jawThickness', 1.6, 1, 4);
  const offset = num(p, 'sweepOffset', 1, 0, 2.5);
  const run = num(p, 'sweepRun', 4.5, 2, 9);
  const wrap = (num(p, 'wrap', 45, 0, 80) * Math.PI) / 180;
  const bite = num(p, 'bite', 0.25, 0.05, 0.6);
  const [ax, az] = ctx.bandAxis;
  const px = -az;
  const pz = ax;
  const toStone = (u: number, v: number): [number, number] => [u * ax + v * px, u * az + v * pz];
  const bd = ctx.baseDrop;
  const shankTop = (u: number) => -bd - ringDrop(ctx, u);
  const yTop = g2 + Math.min(0.35, built.crownHeight * 0.3);

  // girdle radius by angle (band coordinates), lightly smoothed so pointed or notched cuts give a calm curve
  const girdleR = (phi: number): number => {
    let s = 0;
    for (const d of [-0.12, -0.06, 0, 0.06, 0.12]) {
      const a = phi + d;
      const [x, z] = toStone(Math.cos(a), Math.sin(a));
      const [qx, qz] = radialPoint(o, x, z);
      s += Math.hypot(qx, qz);
    }
    return s / 5;
  };
  // where the blade meets the shank it takes the width of the strand it rises from: with an offset (a bypass shank)
  // that is the shank's top width less the offset of both strands, otherwise most of a plain shank's width
  const strand = ctx.shankWidth - 2 * offset;
  const wShoulder = Math.min(4, strand >= 1 ? strand : Math.max(1, ctx.shankWidth * 0.85));

  // the blade from the +u side wrapping the +v side of the stone; the other is its point reflection
  const phiIn = Math.PI / 2 - Math.min(0.9, 0.35 + wrap * 0.5);
  const phiEnd = Math.PI / 2 + wrap;
  const cAt = (phi: number) => girdleR(phi) - bite + W / 2;
  const arcPt = (phi: number): [number, number] => [cAt(phi) * Math.cos(phi), cAt(phi) * Math.sin(phi)];
  const [u3, v3_] = arcPt(phiIn);
  const t3: [number, number] = [-Math.sin(phiIn), Math.cos(phiIn)];
  // the swoop meets the shank before the shank has fallen 3 mm below the seat (keeps the blades low and the head
  // within its bounds even for long stones lying along the band)
  const Rs = shankTopRadius(ctx);
  const uMax = Math.sqrt(Math.max(0, Rs * Rs - (Rs - 3) ** 2));
  const uL = Math.min(u3 + run, Math.max(uMax - 0.6, u3 + 1.5));
  const lead = Math.min(1.4, Math.max(0.3, uMax - uL));
  const P0: [number, number] = [uL, offset];
  const k0 = run * 0.5;
  const k3 = run * 0.35;
  const P1: [number, number] = [uL - k0, offset];
  const P2: [number, number] = [u3 - t3[0] * k3, v3_ - t3[1] * k3];
  const bez = (t: number): [number, number] => {
    const m = 1 - t;
    const b0 = m * m * m;
    const b1 = 3 * m * m * t;
    const b2 = 3 * m * t * t;
    const b3 = t * t * t;
    return [b0 * P0[0] + b1 * P1[0] + b2 * P2[0] + b3 * u3, b0 * P0[1] + b1 * P1[1] + b2 * P2[1] + b3 * v3_];
  };

  const samples: BladeSample[] = [];
  // where it leaves the shank the blade's top is flush with the shank's top surface and its foot is buried in it
  const thShoulder = Math.min(1, Math.max(0.8, (Rs - ctx.innerRadius) * 0.55));
  // buried lead-in: the ribbon emerges from the shank's top surface
  for (let k = 0; k < 4; k++) {
    const u = uL + lead * (1 - k / 4);
    const f = k / 4;
    const top = shankTop(u) - 0.3 + 0.22 * f;
    samples.push({
      u,
      v: offset,
      top,
      bottom: top - thShoulder * 0.8,
      hw: (wShoulder / 2) * (0.55 + 0.45 * f),
    });
  }
  // the swoop: rises in a smooth S from the shoulder to the girdle, widening into the blade and easing from the
  // shank's depth to the blade's
  const NS = 36;
  for (let k = 0; k <= NS; k++) {
    const f = k / NS;
    const [u, v] = bez(f);
    const e = smooth(f);
    const lift = smooth(Math.min(1, f * 1.08)) ** 1.15;
    const st = shankTop(u);
    const top = st - 0.08 + (yTop - st + 0.08) * lift;
    const th = thShoulder + (T - thShoulder) * e;
    samples.push({ u, v, top, bottom: top - th, hw: (wShoulder + (W - wShoulder) * e) / 2 });
  }
  // the wrap: hugs the girdle, thinning towards a rounded tip
  const NA = Math.max(10, Math.round(((phiEnd - phiIn) * 180) / Math.PI / 4));
  const arcLen = (phiEnd - phiIn) * cAt(Math.PI / 2);
  const nose = Math.min(1.4, arcLen * 0.4, W * 0.6);
  for (let k = 1; k <= NA; k++) {
    const f = k / NA;
    const phi = phiIn + (phiEnd - phiIn) * f;
    const [u, v] = arcPt(phi);
    const toEnd = (1 - f) * arcLen;
    const x = Math.min(1, Math.max(0, 1 - toEnd / nose));
    const nz = Math.max(0.14, Math.sqrt(1 - x * x));
    const thin = 1 - 0.3 * smooth(f);
    const t = T * thin * (0.4 + 0.6 * nz);
    const top = yTop - (T - t) * 0.15;
    samples.push({ u, v, top, bottom: top - t, hw: (W / 2) * (0.9 + 0.1 * thin) * nz });
  }

  const geos: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    const pts = samples.map((q) => ({ ...q, u: s * q.u, v: s * q.v }));
    geos.push(ribbon(pts, toStone));
  }
  return [metalPart(geos, 'tension-bypass blades')];
}

registerHeadBuilder('swept-blades', sweptBlades);
