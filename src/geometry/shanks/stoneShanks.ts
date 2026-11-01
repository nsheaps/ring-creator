/** Shanks that carry accent stones: pave (beads) and channel (stones in a groove). */
import * as THREE from 'three';
import { registerShankBuilder } from '../builders';
import type { Part, ShankCtx, ShankResult } from '../types';
import { toFlat, type ProfilePoint } from '../helpers';
import {
  TOP,
  accentDims,
  accentSize,
  bandSection,
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
  thickAt,
  widthAt,
} from './common';
import { GEM_HEX, gradedScales, mixHex, paveGrade } from './pavePath';

/** Stone angles on both shoulders: from the edge of the head down to `coverage` of the half circumference. */
function stoneAngles(a0: number, a1: number, r: number, pitch: number): number[] {
  const one = spacedAngles(a0, a1, r, pitch);
  return [...one.map((a) => TOP - a), ...one.map((a) => TOP + a)];
}

/**
 * Pave section: a two-half superellipse band with a bright-cut trough of half width g, bevel b and depth d cut into
 * the top. Key points are doubled so the bevels keep crisp edges while the rest of the band stays smooth.
 */
export function troughSection(
  R: number,
  w: number,
  t: number,
  outerExp: number,
  innerExp: number,
  trough: { g: number; b: number; d: number },
): ProfilePoint[] {
  const split = 0.55;
  const hTop = t * split;
  const hBot = t - hTop;
  const rMid = R + hBot;
  const hw = w / 2;
  const nIn = 12;
  const out: ProfilePoint[] = [];
  // inner (finger side) half, left -> right
  for (let i = 0; i <= nIn; i++) {
    const a = Math.PI + (i / nIn) * Math.PI;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    out.push([
      hw * Math.sign(c) * Math.abs(c) ** (2 / innerExp),
      rMid + hBot * Math.sign(sn) * Math.abs(sn) ** (2 / innerExp),
    ]);
  }
  out.push(out[out.length - 1]); // crease at the side
  const g = Math.min(trough.g, hw - 0.3);
  const b = Math.max(0.02, Math.min(trough.b, hw - g - 0.15));
  const top = (u: number) => rMid + hTop * Math.max(0, 1 - Math.abs(u / hw) ** outerExp) ** (1 / outerExp);
  const cut = (u: number) => {
    const x = Math.abs(u);
    if (x <= g) return trough.d;
    if (x >= g + b) return 0;
    return trough.d * (1 - (x - g) / b);
  };
  const sideK = 5;
  const us: number[] = [];
  for (let i = 1; i <= sideK; i++) us.push(hw - ((hw - g - b) * i) / sideK); // hw .. g+b
  const right = [...us, g + b, g, g, 0];
  const pts: number[] = [
    ...right,
    ...right
      .slice(0, -1)
      .reverse()
      .map((u) => -u),
  ];
  // pts runs right -> left: hw-.. , g+b, g+b, g, g, 0, -g, -g, -(g+b), -(g+b), .. -hw
  pts.forEach((u) => out.push([u, top(u) - cut(u)]));
  out.push([-hw, rMid]);
  return out;
}

/** Minimum radial thickness (mm) of a micro-pave band. */
export const MICRO_PAVE_MIN_T = 2.0;

/** Upper (outer) half of a two-half superellipse section as a dense polyline from the left edge over the top to the right edge. */
function outerArc(hw: number, hTop: number, e: number, n = 120): { u: number; v: number; s: number }[] {
  const pts: { u: number; v: number; s: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI - (i / n) * Math.PI;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const u = hw * Math.sign(c) * Math.abs(c) ** (2 / e);
    const v = hTop * Math.abs(sn) ** (2 / e);
    const prev = pts[i - 1];
    pts.push({ u, v, s: prev ? prev.s + Math.hypot(u - prev.u, v - prev.v) : 0 });
  }
  return pts;
}

/** A section of the dome at one angle round the ring, with its rows of stones packed across it. */
interface DomeSection {
  arc: { u: number; v: number; s: number }[];
  total: number;
  /** radius of the section's mid line (where the upper half starts) */
  rMid: number;
  /** angular pitch of the stones along every row (radians) */
  dth: number;
  /** each row's offset across the dome from its crown (mm of arc), its surface radius and its stone diameter */
  s: number[];
  r: number[];
  d: number[];
}

/**
 * Micro-pave: the whole upper surface of a rounded band is covered with `rows` staggered rows of tiny stones packed
 * edge to edge (hexagonal packing), over the top and down both faces of the dome, all the way round (coverage 1) or
 * from the head to `coverage` of each half. The stone size comes from the rows and the band: at every point the rows
 * share the dome's arc evenly, and the stones are as large as that spacing allows, so neighbours nearly touch (the
 * gap is `stoneGapMm`, at most 4 % of the pitch). Stones are graduated very slightly where the band tapers or the
 * rows sit at a smaller radius. Tiny beads fill the three-stone interstices. There is no trough; the metal is a
 * smooth dome the stones are sunk into, and the pave climbs the shoulders up under the head's gallery.
 */
function microPave(ctx: ShankCtx, rows: number): ShankResult {
  const p = ctx.params;
  const R = ctx.innerRadius;
  const tp = readTaper(p, { w: 3.2, wTop: 3.4, t: 2.0, tTop: 2.1, taperDeg: 60 });
  // stones are seated all over the dome, pavilions pointing into the metal: a micro-pave band is never thinner than
  // about 2 mm radially, or the seats would break through the finger side
  tp.tBottom = Math.max(tp.tBottom, MICRO_PAVE_MIN_T);
  tp.tTop = Math.max(tp.tTop, tp.tBottom);
  const outerExp = outerExpFromRoundness(num(p, 'roundness', 0.85, 0, 1));
  const coverage = num(p, 'coverage', 1, 0.1, 1);
  const gapMm = num(p, 'stoneGapMm', 0.03, 0, 0.4);
  const split = 0.76;
  /** a polished lip outside the two outer rows (mm of arc) */
  const lip = 0.1;
  /** stone diameter for a centre to centre pitch D: the gap is stoneGapMm, but never more than 4 % of the pitch */
  const fit = (D: number) => Math.min(D, Math.max(D * 0.96, D - gapMm));
  /** point on a dome arc `sArc` mm from its crown: section coordinates and the outward normal */
  const onArc = (arc: DomeSection['arc'], sArc: number) => {
    const total = arc[arc.length - 1].s;
    const target = clamp(total / 2 + sArc, 0, total);
    let j = 1;
    while (j < arc.length - 1 && arc[j].s < target) j++;
    const A = arc[j - 1];
    const B = arc[j];
    const k = (target - A.s) / Math.max(1e-6, B.s - A.s);
    const len = Math.hypot(B.u - A.u, B.v - A.v) || 1;
    // the polyline runs left to right over the top, so the outward side is to its left: (-dv, du)
    return {
      u: A.u + (B.u - A.u) * k,
      v: A.v + (B.v - A.v) * k,
      nu: -(B.v - A.v) / len,
      nv: (B.u - A.u) / len,
    };
  };
  /**
   * Pack the rows across the section at angle th. Every row has the same angular pitch dth (so the rows stay
   * staggered all the way round), a row at radius r has stones of fit(r * dth), and neighbouring rows sit just far
   * enough apart that the diagonal neighbours (half a pitch along, one row across) nearly touch. dth is the largest
   * pitch for which all rows plus a lip either side fit on the arc.
   */
  const sectionAt = (th: number): DomeSection => {
    const w = widthAt(tp, th);
    const t = thickAt(tp, th);
    const arc = outerArc(w / 2, t * split, outerExp);
    const total = arc[arc.length - 1].s;
    const rMid = R + t - t * split;
    let r: number[] = Array.from({ length: rows }, () => rMid + t * split);
    /** straight-line distance between two points of the arc */
    const chord = (s0: number, s1: number) => {
      const a = onArc(arc, s0);
      const b = onArc(arc, s1);
      return Math.hypot(b.u - a.u, b.v - a.v);
    };
    /** arc position `want` mm (straight line) from s0 in direction dir */
    const stepOut = (s0: number, want: number, dir: number) => {
      let ds = want;
      for (let k = 0; k < 3; k++) ds *= want / (chord(s0, s0 + dir * ds) || want);
      return s0 + dir * ds;
    };
    const layout = (dth: number) => {
      const d = r.map((ri) => fit(ri * dth));
      /** centre distance across from row i - 1 to row i: diagonal neighbours (half a pitch along) sit their mean
       * pitch (a stone plus the gap) apart */
      const across = (i: number) => {
        const c = ((r[i - 1] + r[i]) * dth) / 2;
        const half = (Math.min(r[i - 1], r[i]) * dth) / 2;
        return Math.sqrt(Math.max(0, c * c - half * half));
      };
      // lay the rows out symmetrically from the crown, measuring straight across (the dome curves away between them)
      const s = new Array<number>(rows).fill(0);
      const hi = Math.ceil((rows - 1) / 2);
      if (rows % 2 === 0) {
        const want = across(hi);
        let x = want / 2;
        for (let k = 0; k < 3; k++) x *= want / (chord(-x, x) || want);
        s[hi] = x;
        s[hi - 1] = -x;
      }
      for (let i = hi + 1; i < rows; i++) {
        s[i] = stepOut(s[i - 1], across(i), 1);
        s[rows - 1 - i] = -s[i];
      }
      const width = 2 * s[rows - 1] + d[0] / 2 + d[rows - 1] / 2 + 2 * lip;
      return { d, s, width };
    };
    let dth = 0.1;
    for (let pass = 0; pass < 3; pass++) {
      let lo = 1e-3;
      let hi = 1;
      for (let it = 0; it < 40; it++) {
        const m = (lo + hi) / 2;
        if (layout(m).width > total) hi = m;
        else lo = m;
      }
      dth = lo;
      const s0 = layout(dth).s;
      r = s0.map((x) => rMid + onArc(arc, x).v);
    }
    const { d, s: sRows } = layout(dth);
    return { arc, total, rMid, dth, s: sRows, r, d };
  };
  // The rows set the stone size. A band too narrow for that many rows of the asked-for stoneSizeMm (or, with none
  // set, of 0.6 mm stones) widens until they fit, give or take a tenth.
  const asked = num(p, 'stoneSizeMm', 0, 0, 5);
  const minD = asked > 0 ? clamp(asked, 0.6, 2.6) * 0.9 : 0.6;
  const meanD = () => {
    const d = sectionAt(TOP + Math.PI).d;
    return d.reduce((n, x) => n + x, 0) / d.length;
  };
  for (let k = 0; k < 10 && meanD() < minD; k++) {
    tp.wTop *= 1.06;
    tp.wBottom *= 1.06;
    tp.tTop *= 1.02;
    tp.tBottom *= 1.02;
  }
  const rOut = R + tp.tBottom;
  // a head narrows to its base where it meets the band, so the pave climbs the shoulders right up under the
  // gallery (a little over half of the head's half length along the band)
  const a0 = headHalfAngle(ctx, rOut) * 0.55 + 0.02;
  const full = coverage >= 0.999;
  const a1 = full ? Math.PI : Math.max(a0 + 0.05, coverage * Math.PI);
  const band = sweep({
    segments: 200,
    smoothProfile: true,
    profile: (th) =>
      bandSection({
        w: widthAt(tp, th),
        t: thickAt(tp, th),
        R,
        outerExp,
        innerExp: 2.6,
        split,
        n: 32,
      }),
  });
  /**
   * Frame on the dome at angle th, `sArc` mm across from the crown, sunk `sink` below the surface along its normal
   * and scaled by `scale`: X along the band, Y out of the metal (a stone's table), Z across.
   */
  const onDome = (th: number, sec: DomeSection, sArc: number, sink: number, scale = 1): THREE.Matrix4 => {
    const a = onArc(sec.arc, sArc);
    const rr = sec.rMid + a.v - a.nv * sink;
    const uu = a.u - a.nu * sink;
    const c = Math.cos(th);
    const sn = Math.sin(th);
    const X = new THREE.Vector3(-sn, c, 0);
    const Y = new THREE.Vector3(c * a.nv, sn * a.nv, a.nu).normalize();
    const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
    const m = new THREE.Matrix4().makeBasis(
      X.multiplyScalar(scale),
      Y.multiplyScalar(scale),
      Z.multiplyScalar(scale),
    );
    m.setPosition(rr * c, rr * sn, uu);
    return m;
  };
  /** angular pitch at th */
  const step = (th: number) => sectionAt(TOP + th).dth;
  // half-step grid from the head (g[0] = a0) towards a1: even rows sit on odd grid points, odd rows on even ones
  const g: number[] = [a0];
  while (g.length < 4000) {
    const x = g[g.length - 1];
    const h = step(x) / 2;
    const nx = x + step(x + h / 2) / 2;
    if (nx > a1 + 1e-9) {
      // all the way round: stretch or squeeze the grid (by under half a step) so it lands exactly on the bottom,
      // where both halves meet with the same pitch
      if (full && nx - a1 < a1 - x) g.push(nx);
      break;
    }
    g.push(nx);
  }
  let K = g.length - 1;
  if (full && K > 0) {
    const f = (Math.PI - a0) / (g[K] - a0);
    for (let k = 1; k <= K; k++) g[k] = a0 + (g[k] - a0) * f;
  }
  /** does `row` take grid point k (even rows the odd points, odd rows the even ones)? */
  const onRow = (row: number, k: number) => (k % 2 === 1) === (row % 2 === 0);
  /** is there a stone of `row` at grid point k on this side? (the bottom one belongs to side +1 only) */
  const hasStone = (row: number, k: number, side: number) => {
    if (k < 1 || !onRow(row, k)) return false;
    if (full) return k < K || (k === K && side > 0);
    return k <= K - 1;
  };
  if (K < 2) K = 0;
  const secs = g.map((a) => sectionAt(TOP + a));
  const ref = sectionAt(TOP + Math.PI);

  const dims = accentDims(ctx, Math.max(...ref.d));
  const built = ctx.stone(ctx.accent.cut.id, dims, { detail: 'low' });
  const ch = built.crownHeight;
  // stones sit flush in their bored seats: the girdle just below the metal surface, the shallow crown above it
  const stoneSink = ch * 0.12;
  const stoneMs: THREE.Matrix4[] = [];
  for (const side of [-1, 1])
    for (let k = 1; k <= K; k++) {
      const sec = secs[k];
      const th = TOP + side * g[k];
      const dth = k < K ? g[k + 1] - g[k - 1] : 2 * (g[K] - g[K - 1]);
      for (let row = 0; row < rows; row++) {
        if (!hasStone(row, k, side)) continue;
        // the section's packing, adjusted for the grid's local pitch (stretched or squeezed a little at the bottom)
        const scale = (sec.d[row] * Math.min(1, dth / sec.dth)) / dims.width;
        stoneMs.push(onDome(th, sec, sec.s[row], stoneSink * scale, scale));
      }
    }
  // Holding beads: one in every three-stone interstice of the staggered grid (between rows r and r+1, at each grid
  // point: a third of the way across where row r has the two stones, two thirds where row r+1 has them), plus one
  // between neighbours on the outer edges of the two outer rows. They overlap the girdles a little.
  const beadR = clamp(dims.width * 0.12, 0.07, 0.18);
  const beadSink = beadR * 0.35;
  const beadMs: THREE.Matrix4[] = [];
  for (const side of [-1, 1])
    for (let k = 1; k <= K; k++) {
      const sec = secs[k];
      const th = TOP + side * g[k];
      for (let row = 0; row < rows - 1; row++) {
        const lowPair =
          hasStone(row, k - 1, side) && hasStone(row, k + 1, side) && hasStone(row + 1, k, side);
        const highPair =
          hasStone(row + 1, k - 1, side) && hasStone(row + 1, k + 1, side) && hasStone(row, k, side);
        // at the bottom of a full ring the far neighbours are on the other half; that half skips the shared point
        const seam = full && k === K;
        if (seam && side < 0) continue;
        if (!(lowPair || highPair || seam)) continue;
        const across = (sec.s[row + 1] - sec.s[row]) * (onRow(row, k) ? 2 : 1);
        beadMs.push(onDome(th, sec, sec.s[row] + across / 3, beadSink));
      }
      for (const [row, dir] of [
        [0, -1],
        [rows - 1, 1],
      ] as const) {
        if (onRow(row, k) || (full && k === K && side < 0)) continue;
        if (!hasStone(row, k - 1, side) && !hasStone(row, k + 1, side)) continue;
        beadMs.push(onDome(th, sec, sec.s[row] + dir * sec.d[row] * 0.47, beadSink));
      }
    }
  const geos = [band];
  // a low dome is enough: the lower half of every bead is inside the metal (and hundreds of them must fit the budget)
  const dome = toFlat(new THREE.SphereGeometry(beadR, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2));
  if (beadMs.length) geos.push(instances(dome, beadMs));
  const parts: Part[] = [metal(geos, 'micro-pave shank')];
  if (stoneMs.length)
    parts.push({
      slot: 'accent-stone',
      geometry: instances(built.geometry, stoneMs),
      label: 'micro-pave stones',
    });
  return { parts, seatY: R + tp.tTop, topWidth: tp.wTop };
}

function pave(ctx: ShankCtx): ShankResult {
  const p = ctx.params;
  const R = ctx.innerRadius;
  const rowCount = Math.round(num(p, 'rows', 1, 1, 8));
  if (rowCount >= 2) return microPave(ctx, rowCount);
  const tp = readTaper(p, { w: 2.2, wTop: 2.4, t: 1.8, tTop: 1.9, taperDeg: 60 });
  const outerExp = outerExpFromRoundness(num(p, 'roundness', 0.3, 0, 1));
  const coverage = num(p, 'coverage', 0.5, 0.1, 1);
  const grade = paveGrade(ctx);
  // graded in size: the stone (and trough) is built for the largest stone and every stone is scaled down from it
  const big = Math.max(1, grade.to);
  const size = accentSize(ctx, p, 0.8, 2.6) * big;
  const dims = accentDims(ctx, size);
  const built = ctx.stone(ctx.accent.cut.id, dims, { detail: 'low' });
  const gapMm = num(p, 'stoneGapMm', 0.08, 0, 0.6);
  const ch = built.crownHeight;
  // bright-cut trough: stones sit in it with the girdle just below the surface and the table proud of it
  const g = dims.width / 2 + 0.03;
  const bevel = clamp(dims.width * 0.22, 0.18, 0.35);
  const d = ch * 0.65 + 0.06;
  // the shank widens so a polished rim stays either side of the bright cut
  const need = 2 * (g + bevel + 0.18);
  tp.wBottom = Math.max(tp.wBottom, need);
  tp.wTop = Math.max(tp.wTop, need);
  const rOut = R + tp.tBottom;
  const a0 = headHalfAngle(ctx, rOut) + 0.02;
  const a1 = Math.max(a0, coverage * Math.PI);
  const pitch = dims.length + gapMm;
  const graded = grade.to !== 1;
  // per stone: size factor, and the arc length (mm from a0) of its start; bounds[count] closes the row
  const scales = graded
    ? gradedScales((a1 - a0) * rOut, dims.length, gapMm, grade.to)
    : Array.from({ length: Math.max(0, Math.floor(((a1 - a0) * rOut) / pitch)) }, () => 1);
  const count = scales.length;
  const bounds: number[] = [0];
  for (let i = 0; i < count; i++)
    bounds.push(graded ? bounds[i] + dims.length * scales[i] + gapMm : (i + 1) * pitch);
  const centres = scales.map((k, i) =>
    graded ? bounds[i] + (dims.length * k + gapMm) / 2 : (i + 0.5) * pitch,
  );
  const one = centres.map((s) => a0 + s / rOut);
  const zoneEnd = count > 0 ? a0 + (bounds[count] + 0.1) / rOut : a0;
  const fade = 0.06;
  const troughAt = (th: number) => {
    if (count === 0) return 0;
    const dd = fromTop(th);
    return smooth((dd - (a0 - 0.08)) / fade) * smooth((zoneEnd - dd) / fade);
  };
  /** size factor of the stone under angle th (linear between stone centres), so a graded trough narrows with them */
  const scaleAt = (th: number) => {
    if (!graded || count === 0) return 1;
    const s = (fromTop(th) - a0) * rOut;
    if (s <= centres[0]) return scales[0];
    for (let i = 1; i < count; i++)
      if (s <= centres[i])
        return (
          scales[i - 1] + ((scales[i] - scales[i - 1]) * (s - centres[i - 1])) / (centres[i] - centres[i - 1])
        );
    return scales[count - 1];
  };
  const band = sweep({
    segments: 240,
    smoothProfile: true,
    profile: (th) => {
      const k = scaleAt(th);
      return troughSection(R, widthAt(tp, th), thickAt(tp, th), outerExp, 3, {
        g: graded ? (dims.width * k) / 2 + 0.03 : g,
        b: graded ? clamp(dims.width * k * 0.22, 0.18, 0.35) : bevel,
        d: (graded ? ch * k * 0.65 + 0.06 : d) * troughAt(th),
      });
    },
  });
  // colour grade: stone i of n mixes from the accent colour (next to the head) to the grade colour (outermost)
  const hexOf = (i: number) =>
    grade.colorHex && i > 0 ? mixHex(ctx.accent.colorHex, grade.colorHex, i / Math.max(1, count - 1)) : '';
  const stoneMs = new Map<string, THREE.Matrix4[]>();
  const beadMs: THREE.Matrix4[] = [];
  const beadR = clamp(dims.width * 0.14, 0.1, 0.22);
  const beadU = (dims.width / 2) * 0.8;
  for (const side of [-1, 1])
    one.forEach((a, i) => {
      const th = TOP + side * a;
      const k = scales[i];
      const m = ringFrame(th, R + thickAt(tp, th) - ch * 0.7 * k, 0);
      if (graded) m.multiply(new THREE.Matrix4().makeScale(k, k, k));
      const key = hexOf(i);
      const list = stoneMs.get(key) ?? [];
      list.push(m);
      stoneMs.set(key, list);
    });
  // beads are shared: one pair in every gap between neighbouring stones, plus one pair closing each end of the row
  for (const side of [-1, 1])
    for (let i = 0; i <= count; i++) {
      const a = TOP + side * (a0 + bounds[i] / rOut);
      const t = thickAt(tp, a);
      const k = graded ? (scales[Math.max(0, i - 1)] + scales[Math.min(count - 1, i)]) / 2 : 1;
      for (const u of [-beadU * k, beadU * k])
        beadMs.push(ringFrame(a, R + t - ch * 0.7 * k + ch * 0.35 * k, u));
    }
  const geos = [band];
  if (count > 0) geos.push(instances(beadGeometry(beadR, 8, 6), beadMs));
  const parts: Part[] = [metal(geos, 'pave shank')];
  for (const [hex, ms] of stoneMs) {
    const geometry = instances(built.geometry, ms);
    // a graded stone's own body colour, read by the assembler (see GEM_HEX)
    if (hex) geometry.userData[GEM_HEX] = hex;
    parts.push({ slot: 'accent-stone', geometry, label: hex ? 'graded pave stones' : 'pave stones' });
  }
  return { parts, seatY: R + tp.tTop, topWidth: tp.wTop };
}
registerShankBuilder('pave', pave);

/** Channel section: a flat-topped band with a groove of half-width gw and depth gd cut into the top. */
function channelSection(R: number, w: number, t: number, gw: number, gd: number): ProfilePoint[] {
  const hw = w / 2;
  const c = Math.min(0.25, t * 0.15, hw * 0.2);
  const top = R + t;
  const g = Math.min(gw, hw - 0.35);
  // bright-cut chamfer on the inside edge of each wall (fades out with the groove)
  const e = Math.min(0.12, gd * 0.5, (hw - g) * 0.4);
  return [
    [-hw + c, R],
    [hw - c, R],
    [hw, R + c],
    [hw, top - c],
    [hw - c, top],
    [g + e, top],
    [g, top - e],
    [g, top - gd],
    [-g, top - gd],
    [-g, top - e],
    [-g - e, top],
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
  const pitch = dims.length + num(p, 'stoneGapMm', 0.04, 0, 0.6);
  const angles = stoneAngles(hA + 0.02, zoneEnd - fade, rOut, pitch);
  const ms = angles.map((th) => ringFrame(th, R + thickAt(tp, th) - built.crownHeight - 0.04, 0));
  const parts: Part[] = [metal([band], 'channel shank')];
  if (ms.length)
    parts.push({ slot: 'accent-stone', geometry: instances(built.geometry, ms), label: 'channel stones' });
  return { parts, seatY: R + tp.tTop, topWidth: tp.wTop };
}
registerShankBuilder('channel', channel);
