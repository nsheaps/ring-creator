/**
 * Multi-strand shanks built from real wires (round sections perpendicular to the wire path, see helpers.wireLoop):
 *   twisted  - a rope of 2-4 round wires wound helically and touching, so the surface shows diagonal ridges;
 *   braided  - a flat three-strand plait of ribbons that cross over and under, so the top shows a chevron weave.
 */
import { registerShankBuilder } from '../builders';
import * as THREE from 'three';
import type { Part, ShankCtx, ShankResult } from '../types';
import { braidStrands, minRadial, pinRadial, ropeStrands, wireLoop } from '../helpers';
import { TAU, TOP, beadGeometry, finish, instances, metal, num } from './common';
import { paveAlong, paveOn, paveSpec, paveZone, strandFrom, type PaveRun } from './pavePath';

/**
 * Twisted rope with pave: flat-faced wires (wider along the finger than they are thick) wound helically, with stones
 * set along whichever wire is passing over the top. The stones follow the wires' spiral path.
 */
function twistedPave(ctx: ShankCtx, k: number, W0: number, T0: number, turns0: number): ShankResult {
  const R = ctx.innerRadius;
  const pv = paveSpec(ctx, { max: 1.4, rim: 0.1 });
  // the wires are strongly curved across their width: sink the holding beads further in
  pv.beadSink = pv.ch * 0.35 + 0.15;
  pv.beadU *= 0.85;
  // a long twist pitch keeps the over-the-top runs long enough to hold stones
  const turns = Math.min(turns0, 10);
  const ring = 1 + 1 / Math.sin(Math.PI / k);
  const rw = pv.dims.width / 2 + 0.16;
  const W = Math.max(W0, 2 * rw * ring);
  const T = Math.max(T0, 2 * 0.42 * ring);
  const rr = Math.min(0.6, T / (2 * ring));
  const au = W / 2 - rw;
  const ar = T / 2 - rr;
  const Rc = R + T / 2;
  const sides = 10;
  const samples = Math.min(Math.max(160, turns * 26), Math.floor(42000 / (2 * sides * k)));
  const centre = (j: number) => (th: number) => {
    const a = turns * th + (j / k) * TAU;
    const r = Rc + ar * Math.sin(a);
    return { r, z: au * Math.cos(a), a };
  };
  const geos = Array.from({ length: k }, (_, j) =>
    wireLoop(
      (s) => {
        const c = centre(j)(s * TAU);
        return new THREE.Vector3(c.r * Math.cos(s * TAU), c.r * Math.sin(s * TAU), c.z);
      },
      { samples, sides, radius: () => [rr, rw] },
    ),
  );
  const shift = R - minRadial(geos);
  pinRadial(geos, R);
  const [a0, a1] = paveZone(ctx, pv, R + T);
  const runs: PaveRun[] = [];
  if (a1 > a0)
    for (let j = 0; j < k; j++)
      for (const dir of [1, -1]) {
        const n = Math.max(80, Math.ceil(((a1 - a0) * turns * 24) / TAU) * 2);
        const pts: THREE.Vector3[] = [];
        const hints: THREE.Vector3[] = [];
        for (let i = 0; i <= n; i++) {
          const th = TOP + dir * (a0 + ((a1 - a0) * i) / n);
          const c = centre(j)(th);
          const radial = new THREE.Vector3(Math.cos(th), Math.sin(th), 0);
          // outward from the rope's axis, and the matching point on the wire's surface
          const out = radial
            .clone()
            .multiplyScalar(ar * Math.sin(c.a))
            .add(new THREE.Vector3(0, 0, au * Math.cos(c.a)));
          const ur = out.dot(radial) / (out.length() || 1);
          const uz = (au * Math.cos(c.a)) / (out.length() || 1);
          const off = Math.hypot(rr * ur, rw * uz);
          const base = radial
            .clone()
            .multiplyScalar(c.r + shift)
            .add(new THREE.Vector3(0, 0, c.z));
          const up = out.clone().normalize();
          pts.push(base.addScaledVector(up, off));
          hints.push(up);
        }
        const strand = strandFrom(pts, (i) => hints[i]);
        const facing = (f: { p: THREE.Vector3; up: THREE.Vector3 }) =>
          f.up.dot(new THREE.Vector3(f.p.x, f.p.y, 0).normalize()) > 0.5;
        runs.push(paveAlong(strand, pv, 0, strand.length, facing));
      }
  const beadMs = runs.flatMap((r) => r.beads);
  const stoneMs = runs.flatMap((r) => r.stones);
  const metalGeos = geos.map(finish);
  if (beadMs.length) metalGeos.push(instances(beadGeometry(pv.beadR, 8, 6), beadMs));
  const parts: Part[] = [metal(metalGeos, 'twisted shank')];
  if (stoneMs.length)
    parts.push({
      slot: 'accent-stone',
      geometry: instances(pv.built.geometry, stoneMs),
      label: 'pave stones',
    });
  return { parts, seatY: R + T * 0.94, topWidth: W };
}

function twisted(ctx: ShankCtx): ShankResult {
  const p = ctx.params;
  const R = ctx.innerRadius;
  const strands = Math.round(num(p, 'strands', 2, 2, 4));
  const width = num(p, 'widthMm', 2.3, 1.4, 4);
  const thick = num(p, 'thicknessMm', 1.9, 1.2, 3);
  const twists = Math.round(num(p, 'twists', 20, 6, 40));
  // 0.55 = wires just touching; larger wires overlap into a tighter rope
  const wire = num(p, 'wireFraction', 0.55, 0.4, 0.75) / 0.55;
  if (paveOn(ctx)) return twistedPave(ctx, strands, width, thick, twists);
  const geos = ropeStrands({ R, W: width, T: thick, strands, turns: twists, wire, budget: 42000 }).map(
    finish,
  );
  return { parts: [metal(geos, 'twisted shank')], seatY: R + thick * 0.94, topWidth: width };
}
registerShankBuilder('twisted', twisted);

function braided(ctx: ShankCtx): ShankResult {
  const p = ctx.params;
  const R = ctx.innerRadius;
  const width = num(p, 'widthMm', 2.6, 1.6, 4.5);
  const thick = num(p, 'thicknessMm', 1.7, 1.2, 3);
  const cycles = Math.round(num(p, 'cycles', 16, 6, 30));
  const ribbon = num(p, 'strandMm', 0.95, 0.5, 1.6) * 1.15;
  const geos = braidStrands({ R, W: width, T: thick, cycles, ribbon, sides: 10, budget: 42000 }).map(finish);
  return { parts: [metal(geos, 'braided shank')], seatY: R + thick * 0.9, topWidth: width };
}
registerShankBuilder('braided', braided);
