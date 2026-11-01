/**
 * Swept tension blades (the tension-bypass head): each end of the band lifts off the shoulder in a low, smooth swoop
 * and wraps round one side of the stone like a ribbon, its inner edge biting the girdle. The two blades are point
 * symmetric: the one from the +band side wraps the +across side of the stone, the other the opposite side, so they
 * pass each other like a bypass and hold the stone between them across the finger.
 */
import * as THREE from 'three';
import { registerHeadBuilder } from '../builders';
import type { BuiltStone, HeadCtx, Part, ShankEnds } from '../types';
import { instanceGeometry, loftRows, toFlat } from '../helpers';
import { stoneMatrix, strandFrom } from '../shanks/pavePath';
import {
  accentDims,
  accentPart,
  bool,
  cleanOutline,
  metalPart,
  num,
  ringDrop,
  shankTopRadius,
  signedVolume,
  str,
  v3,
} from './common';
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
  /** outward bank of the ribbon's face (radians): the edge away from the stone dips, the face looks up and out */
  bank?: number;
  /** 0..1: how much the section takes the shank end's own profile (1 where the blade grows out of the shank) */
  root?: number;
  /** exact centre-line direction (u, y, v) where neighbours would only give a chord (the joined root) */
  dir?: [number, number, number];
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

/** Section frame of one blade sample: centre, sideways and upward unit vectors, half depth and half width. */
interface BladeFrame {
  c: THREE.Vector3;
  lat: THREE.Vector3;
  up: THREE.Vector3;
  tan: THREE.Vector3;
  hh: number;
  hw: number;
  root: number;
}

/** Frames along the centre line; each section is square to the 3D tangent so a steep swoop keeps its full depth. */
function bladeFrames(
  samples: BladeSample[],
  toStone: (u: number, v: number) => [number, number],
): BladeFrame[] {
  // which side of the ribbon faces away from the stone, decided once where it hugs the girdle (its last sample) and
  // kept along the whole blade so the bank never flips
  const last = samples[samples.length - 1];
  const prev = samples[Math.max(0, samples.length - 2)];
  const [lx, lz] = toStone(last.u, last.v);
  const [qx, qz] = toStone(prev.u, prev.v);
  const outSign = (qx - lx) * lz - (qz - lz) * lx >= 0 ? -1 : 1;
  return samples.map((p, i) => {
    const a = samples[Math.max(0, i - 1)];
    const b = samples[Math.min(samples.length - 1, i + 1)];
    const [ax, az] = toStone(a.u, a.v);
    const [bx, bz] = toStone(b.u, b.v);
    const t = v3(bx - ax, (b.top + b.bottom - a.top - a.bottom) / 2, bz - az);
    if (p.dir) {
      const [dx, dz] = toStone(p.dir[0], p.dir[2]);
      t.set(dx, p.dir[1], dz);
    }
    if (t.lengthSq() < 1e-12) t.set(1, 0, 0);
    t.normalize();
    const lat = v3(-t.z, 0, t.x);
    if (lat.lengthSq() < 1e-9) lat.set(1, 0, 0);
    lat.normalize();
    let up = lat.clone().cross(t).normalize();
    if (up.y < 0) up.negate();
    const [cx, cz] = toStone(p.u, p.v);
    const c = v3(cx, (p.top + p.bottom) / 2, cz);
    const bk = p.bank ?? 0;
    if (bk > 1e-4) {
      // tilt the section about the tangent so the face turns away from the stone; drop it so the inner (stone-side)
      // edge keeps its height and the girdle stays gripped
      const out = lat.clone().multiplyScalar(outSign);
      const nUp = up.clone().multiplyScalar(Math.cos(bk)).addScaledVector(out, Math.sin(bk));
      const nOut = out.clone().multiplyScalar(Math.cos(bk)).addScaledVector(up, -Math.sin(bk));
      c.y -= p.hw * Math.sin(bk) * 0.85;
      up = nUp.normalize();
      lat.copy(nOut.multiplyScalar(outSign)).normalize();
    }
    return {
      c,
      lat,
      up,
      tan: t,
      hh: Math.max(0.02, (p.top - p.bottom) / 2),
      hw: p.hw,
      root: p.root ?? 0,
    };
  });
}

/**
 * Where a ray from (0, 0) along (dx, dy) leaves a closed polygon (the first crossing), as a multiple of the ray's
 * length; null when it misses.
 */
function rayHit(poly: [number, number][], dx: number, dy: number): number | null {
  let best: number | null = null;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    const ex = bx - ax;
    const ey = by - ay;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = (ax * ey - ay * ex) / den;
    const u = (ax * dy - ay * dx) / den;
    if (t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 && (best === null || t < best)) best = t;
  }
  return best;
}

/**
 * Closed smooth-shaded solid from blade frames (indexed loft, outward winding, smooth normals). With `rootProfile`
 * (the shank end's section, centred on its middle, in (lateral, up)) a frame's `root` weight morphs its section from
 * that profile into the ribbon's, so the first section is exactly the shank's end.
 */
function ribbon(frames: BladeFrame[], rootProfile?: [number, number][]): THREE.BufferGeometry {
  const shape = sectionShape(rootProfile ? 32 : 22, 2.8);
  const rows: THREE.Vector3[][] = frames.map((f) =>
    shape.map(([sx, sy]) => {
      // a slightly domed top: the upper half is fuller than the lower one
      let lx = sx * f.hw;
      let ly = sy * f.hh * (sy > 0 ? 1 : 0.92);
      if (rootProfile && f.root > 0) {
        const t = rayHit(rootProfile, lx, ly);
        if (t !== null) {
          lx += (lx * t - lx) * f.root;
          ly += (ly * t - ly) * f.root;
        }
      }
      return f.c.clone().addScaledVector(f.lat, lx).addScaledVector(f.up, ly);
    }),
  );
  const m = shape.length;
  // joined root: the end cap gets its own copy of the first row, so the rim's normals follow the side faces only and
  // match the shank's (whose cap has its own vertices too); the zero-length quads between the copies are dropped
  const g = loftRows(rootProfile ? [rows[0].map((q) => q.clone()), ...rows] : rows);
  if (rootProfile) {
    const idx = g.getIndex();
    if (idx) {
      const keep: number[] = [];
      for (let k = 0; k + 2 < idx.count; k += 3) {
        const tri = [idx.getX(k), idx.getX(k + 1), idx.getX(k + 2)];
        const inFirst = tri.some((q) => q < m);
        const inSecond = tri.some((q) => q >= m && q < 2 * m);
        if (!(inFirst && inSecond)) keep.push(...tri);
      }
      g.setIndex(keep);
    }
  }
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
 * down to the shank), `wrap` (degrees each blade wraps round the stone past its middle), `bite` (groove depth),
 * `bank` (degrees the ribbon's face tilts up and away from the stone, so a wide flat ribbon catches the light), `hand` ('right': the +band blade wraps the +across side; 'left' mirrors the swirl, to match a left-hand bypass shank)
 * and `bladePave` / `paveSizeMm` (a single row of small accent stones along the top of each blade).
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
  const hand = str(p, 'hand', ['right', 'left'] as const, 'right') === 'left' ? -1 : 1;
  const bank = (num(p, 'bank', 0, 0, 40) * Math.PI) / 180;
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
  let wShoulder = Math.min(4, strand >= 1 ? strand : Math.max(1, ctx.shankWidth * 0.85));
  // a shank whose ends stop on the shoulders (bypass, ends: 'blade'): the blade starts exactly at the +band end, with
  // its section, and continues it
  const join = ctx.shankEnds ? endRoot(ctx.shankEnds) : null;
  if (join) wShoulder = join.w;
  // ring-frame y of the girdle plane: stone-frame y = ring y - gY
  const gY = shankTopRadius(ctx) + bd;

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
  const uL = join ? join.rc * Math.sin(join.angle) : Math.min(u3 + run, Math.max(uMax - 0.6, u3 + 1.5));
  const lead = Math.min(1.4, Math.max(0.3, uMax - uL));
  // with a joined shank the root sits on the end's own centre line (the hand sign cancels when the blade is mirrored)
  const v0 = join ? hand * join.z : offset;
  const P0: [number, number] = [uL, v0];
  // handles scaled to the span actually covered, so a short span (a long stone, a small ring) never hooks back on itself
  const span = Math.hypot(uL - u3, v0 - v3_);
  const k0 = Math.min(run * 0.5, span * 0.45);
  const k3 = Math.min(run * 0.35, span * 0.4);
  const P1: [number, number] = [uL - k0, v0];
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
  const thShoulder = join ? join.t : Math.min(1, Math.max(0.8, (Rs - ctx.innerRadius) * 0.55));
  // buried lead-in: the ribbon emerges from the shank's top surface (a joined shank needs none)
  for (let k = 0; !join && k < 4; k++) {
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
    const th = thShoulder + (T - thShoulder) * e;
    let top: number;
    if (join) {
      // the centre leaves the shank end's centre circle and rises to the blade's
      const cy0 = Math.sqrt(Math.max(0, join.rc * join.rc - u * u)) - gY;
      top = cy0 + (yTop - T / 2 - cy0) * lift + th / 2;
    } else {
      const st = shankTop(u);
      top = st - 0.08 + (yTop - st + 0.08) * lift;
    }
    samples.push({
      u,
      v,
      top,
      bottom: top - th,
      hw: (wShoulder + (W - wShoulder) * e) / 2,
      bank: bank * smooth((f - 0.35) / 0.65),
      ...(join ? { root: 1 - smooth(f / 0.5) } : {}),
      // the root section lies exactly in the shank end's radial plane
      ...(join && k === 0
        ? { dir: [-Math.cos(join.angle), Math.sin(join.angle), 0] as [number, number, number] }
        : {}),
    });
  }
  // the wrap: hugs the girdle and tapers to a point beside the stone; the inner edge stays on the girdle while the
  // outer edge closes in
  const NA = Math.max(10, Math.round(((phiEnd - phiIn) * 180) / Math.PI / 4));
  const arcLen = (phiEnd - phiIn) * cAt(Math.PI / 2);
  const nose = Math.min(arcLen * 0.6, Math.max(1.4, W * 1.2));
  for (let k = 1; k <= NA; k++) {
    const f = k / NA;
    const phi = phiIn + (phiEnd - phiIn) * f;
    const toEnd = (1 - f) * arcLen;
    const x = Math.min(1, Math.max(0, toEnd / nose));
    // a long, slightly full taper to a fine point
    const nz = Math.max(0.06, Math.sin((x * Math.PI) / 2));
    const thin = 1 - 0.3 * smooth(f);
    const t = T * thin * (0.45 + 0.55 * nz);
    const hw = (W / 2) * (0.9 + 0.1 * thin) * nz;
    const r = girdleR(phi) - bite + hw;
    const top = yTop - (T - t) * 0.15;
    samples.push({ u: r * Math.cos(phi), v: r * Math.sin(phi), top, bottom: top - t, hw, bank: bank * nz });
  }

  const geos: THREE.BufferGeometry[] = [];
  const stones: THREE.Matrix4[] = [];
  const beads: THREE.Matrix4[] = [];
  const pave = bool(p, 'bladePave', false) ? bladePaveSpec(ctx, num(p, 'paveSizeMm', 1.1, 0.7, 1.8)) : null;
  for (const s of [1, -1]) {
    const pts = samples.map((q) => ({
      ...q,
      u: s * q.u,
      v: s * hand * q.v,
      ...(q.dir ? { dir: [s * q.dir[0], q.dir[1], s * hand * q.dir[2]] as [number, number, number] } : {}),
    }));
    const frames = bladeFrames(pts, toStone);
    geos.push(ribbon(frames, join?.profile));
    // the stones start where the blade leaves the shank (after the buried lead-in)
    if (pave) layBladePave(join ? frames : frames.slice(4), pave, stones, beads);
  }
  if (!pave) return [metalPart(geos, 'tension-bypass blades')];
  if (beads.length) geos.push(instanceGeometry(toFlat(new THREE.IcosahedronGeometry(pave.beadR, 1)), beads));
  const parts = [metalPart(geos, 'tension-bypass blades')];
  if (stones.length)
    parts.push(accentPart([instanceGeometry(toFlat(pave.built.geometry), stones)], 'blade pave stones'));
  return parts;
}

/** The shank end as the blade's root: centre radius, width, thickness and the section about its middle. */
function endRoot(e: ShankEnds): {
  angle: number;
  z: number;
  rc: number;
  w: number;
  t: number;
  profile: [number, number][];
} {
  let zMin = Infinity;
  let zMax = -Infinity;
  let rMin = Infinity;
  let rMax = -Infinity;
  for (const [z, r] of e.profile) {
    zMin = Math.min(zMin, z);
    zMax = Math.max(zMax, z);
    rMin = Math.min(rMin, r);
    rMax = Math.max(rMax, r);
  }
  const zc = (zMin + zMax) / 2;
  const rc = (rMin + rMax) / 2;
  return {
    angle: e.angle,
    z: e.z + zc,
    rc,
    w: zMax - zMin,
    t: rMax - rMin,
    profile: e.profile.map(([z, r]): [number, number] => [z - zc, r - rc]),
  };
}

interface BladePave {
  built: BuiltStone;
  width: number;
  pitch: number;
  beadR: number;
}

function bladePaveSpec(ctx: HeadCtx, size: number): BladePave {
  const dims = accentDims(ctx, size);
  const built = ctx.stone(ctx.accent.cut.id, dims, { detail: 'low' });
  return {
    built,
    width: dims.width,
    pitch: dims.length + 0.1,
    beadR: Math.min(0.2, Math.max(0.1, dims.width * 0.14)),
  };
}

/**
 * A row of stones along the top of one blade at a fixed pitch, tables square to the ribbon's top, where the ribbon is
 * wide enough to keep a little polished rim either side; clear of the rounded tip. Shared beads sit between stones.
 */
function layBladePave(
  frames: BladeFrame[],
  spec: BladePave,
  stones: THREE.Matrix4[],
  beads: THREE.Matrix4[],
): void {
  const pts = frames.map((f) => f.c.clone().addScaledVector(f.up, f.hh));
  const strand = strandFrom(pts, (i) => frames[i].up);
  const cum = strand.cum;
  const hwAt = (sArc: number): number => {
    let i = 0;
    while (i < cum.length - 1 && cum[i + 1] < sArc) i++;
    const j = Math.min(cum.length - 1, i + 1);
    const k = cum[j] > cum[i] ? (sArc - cum[i]) / (cum[j] - cum[i]) : 0;
    return frames[i].hw + (frames[j].hw - frames[i].hw) * Math.min(1, Math.max(0, k));
  };
  const need = spec.width / 2 + 0.12;
  const fits = (sArc: number) =>
    hwAt(sArc - spec.pitch / 2) >= need && hwAt(sArc) >= need && hwAt(sArc + spec.pitch / 2) >= need;
  // the usable stretch: from the first place the ribbon is wide enough to the last one
  let s0 = -1;
  let s1 = -1;
  for (let sArc = spec.pitch / 2; sArc <= strand.length - spec.pitch / 2; sArc += 0.05)
    if (fits(sArc)) {
      if (s0 < 0) s0 = sArc - spec.pitch / 2;
      s1 = sArc + spec.pitch / 2;
    }
  if (s0 < 0) return;
  const count = Math.floor((s1 - s0) / spec.pitch);
  const start = s0 + (s1 - s0 - count * spec.pitch) / 2;
  const sink = spec.built.girdleThickness * 0.5 + 0.04;
  const beadU = (spec.width / 2) * 0.8;
  for (let i = 0; i < count; i++) {
    const sc = start + (i + 0.5) * spec.pitch;
    if (!fits(sc)) continue;
    stones.push(stoneMatrix(strand.at(sc), sink));
    if (i > 0) {
      const fb = strand.at(start + i * spec.pitch);
      for (const side of [-1, 1]) beads.push(stoneMatrix(fb, -spec.beadR * 0.25, side * beadU));
    }
  }
}

registerHeadBuilder('swept-blades', sweptBlades);
